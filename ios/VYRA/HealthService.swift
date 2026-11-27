import Foundation
import HealthKit
import Combine

struct HealthPayload: Codable {
    var steps: [String: Double]
    var sleep: [String: Double]
    var workouts: [String: Double]
    var distanceMeters: [String: Double]
    var updatedAt: String
}

final class HealthService: ObservableObject {
    @Published private(set) var latest: HealthPayload?

    private let store = HKHealthStore()
    private var observerQueries: [HKObserverQuery] = []
    private var observing = false
    private let calendar = Calendar.current

    private var stepType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .stepCount)! }
    private var distanceType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)! }
    private var sleepType: HKCategoryType { HKObjectType.categoryType(forIdentifier: .sleepAnalysis)! }
    private var workoutType: HKWorkoutType { HKObjectType.workoutType() }
    private var types: [HKSampleType] { [stepType, distanceType, sleepType, workoutType] }

    func requestAccess(completion: @escaping () -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion()
            return
        }
        store.requestAuthorization(toShare: Set<HKSampleType>(),
                                   read: Set<HKObjectType>(types)) { _, error in
            if let error = error { print("VYRA HealthKit authorization: \(error)") }
            // Apple does not disclose whether read permission was granted.
            DispatchQueue.main.async {
                self.startObservers()
                self.refresh()
                completion()
            }
        }
    }

    func startObservers() {
        guard HKHealthStore.isHealthDataAvailable(), !observing else { return }
        observing = true

        for type in types {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, finish, error in
                if let error = error { print("VYRA observer: \(error)") }
                guard let self = self else { finish(); return }
                self.refresh(completion: finish)
            }
            observerQueries.append(query)
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, error in
                if let error = error { print("VYRA background delivery: \(error)") }
            }
        }
    }

    func refresh(completion: (() -> Void)? = nil) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion?()
            return
        }

        let now = Date()
        let startDay = calendar.startOfDay(for: now)
        let from = calendar.date(byAdding: .day, value: -30, to: startDay)!
        let group = DispatchGroup()
        let lock = NSLock()
        var steps: [String: Double] = [:]
        var distance: [String: Double] = [:]
        var sleeps: [String: Double] = [:]
        var workouts: [String: Double] = [:]

        group.enter()
        readDailyQuantity(stepType, unit: .count(), from: from) { result in
            lock.lock(); steps = result; lock.unlock(); group.leave()
        }
        group.enter()
        readDailyQuantity(distanceType, unit: .meter(), from: from) { result in
            lock.lock(); distance = result; lock.unlock(); group.leave()
        }
        group.enter()
        readSleep(from: from) { result in
            lock.lock(); sleeps = result; lock.unlock(); group.leave()
        }
        group.enter()
        readWorkouts(from: from) { result in
            lock.lock(); workouts = result; lock.unlock(); group.leave()
        }
        group.notify(queue: .main) {
            self.latest = HealthPayload(
                steps: steps, sleep: sleeps, workouts: workouts,
                distanceMeters: distance,
                updatedAt: ISO8601DateFormatter().string(from: now))
            completion?()
        }
    }

    private func dayKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func readDailyQuantity(
        _ type: HKQuantityType,
        unit: HKUnit,
        from: Date,
        completion: @escaping ([String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(
            withStart: from, end: Date(), options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: calendar.startOfDay(for: Date()),
            intervalComponents: DateComponents(day: 1))
        query.initialResultsHandler = { [weak self] _, collection, error in
            if let error = error { print("VYRA quantity: \(error)") }
            var values: [String: Double] = [:]
            collection?.enumerateStatistics(from: from, to: Date()) { entry, _ in
                guard let sum = entry.sumQuantity(), let self = self else { return }
                let amount = max(0, sum.doubleValue(for: unit))
                if amount > 0 {
                    values[self.dayKey(entry.startDate)] = amount
                }
            }
            completion(values)
        }
        store.execute(query)
    }

    private func readWorkouts(
        from: Date,
        completion: @escaping ([String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(
            withStart: from, end: Date(), options: .strictStartDate)
        let query = HKSampleQuery(
            sampleType: workoutType, predicate: predicate,
            limit: HKObjectQueryNoLimit, sortDescriptors: nil
        ) { [weak self] _, samples, error in
            if let error = error { print("VYRA workouts: \(error)") }
            guard let self = self else { completion([:]); return }
            var values: [String: Double] = [:]
            for workout in (samples as? [HKWorkout] ?? []) {
                values[self.dayKey(workout.startDate), default: 0] += 1
            }
            completion(values)
        }
        store.execute(query)
    }

    private func readSleep(
        from: Date,
        completion: @escaping ([String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(
            withStart: from, end: Date(), options: .strictEndDate)
        let query = HKSampleQuery(
            sampleType: sleepType, predicate: predicate,
            limit: HKObjectQueryNoLimit, sortDescriptors: nil
        ) { [weak self] _, samples, error in
            if let error = error { print("VYRA sleep: \(error)") }
            guard let self = self else { completion([:]); return }
            var intervals: [String: [DateInterval]] = [:]
            for sample in (samples as? [HKCategorySample] ?? []) {
                guard let kind = HKCategoryValueSleepAnalysis(rawValue: sample.value) else { continue }
                // Exclude "in bed" and awake periods; count asleep stages only.
                switch kind {
                case .asleep, .asleepCore, .asleepDeep, .asleepREM, .asleepUnspecified:
                    break
                default:
                    continue
                }
                let dayStart = self.calendar.startOfDay(for: sample.endDate)
                let evening = self.calendar.date(byAdding: .hour, value: 18, to: dayStart)!
                let assignedDay = sample.endDate >= evening
                    ? self.calendar.date(byAdding: .day, value: 1, to: dayStart)!
                    : dayStart
                intervals[self.dayKey(assignedDay), default: []].append(
                    DateInterval(start: sample.startDate, end: sample.endDate))
            }

            var values: [String: Double] = [:]
            for (day, periods) in intervals {
                let sorted = periods.sorted { $0.start < $1.start }
                var rangeEnd: Date?
                var total: TimeInterval = 0
                for interval in sorted {
                    if let end = rangeEnd {
                        if interval.start > end {
                            // Union overlaps from multiple Apple Health sources.
                            total += interval.duration
                            rangeEnd = interval.end
                        } else {
                            total += max(0, interval.end.timeIntervalSince(end))
                            rangeEnd = max(end, interval.end)
                        }
                    } else {
                        total += interval.duration
                        rangeEnd = interval.end
                    }
                }
                if total > 0 { values[day] = min(24, total / 3600) }
            }
            completion(values)
        }
        store.execute(query)
    }
}
