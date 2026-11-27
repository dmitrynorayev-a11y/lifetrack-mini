import SwiftUI
import WebKit

@main
struct VYRAApp: App {
    @StateObject private var health = HealthService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(health)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var health: HealthService
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("vyra.onboarded") private var onboarded = false
    @AppStorage("vyra.health.requested") private var healthRequested = false

    var body: some View {
        Group {
            if onboarded {
                GameWebView(health: health)
                    .ignoresSafeArea(.container, edges: .bottom)
            } else {
                ConnectHealthView(
                    connect: {
                        health.requestAccess {
                            healthRequested = true
                            onboarded = true
                        }
                    },
                    skip: {
                        healthRequested = false
                        onboarded = true
                    }
                )
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            if onboarded && healthRequested {
                health.startObservers()
                health.refresh()
            }
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active && healthRequested {
                health.refresh()
            }
        }
    }
}

struct ConnectHealthView: View {
    let connect: () -> Void
    let skip: () -> Void

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .center, spacing: 20) {
                    Spacer(minLength: 24)
                    Image(systemName: "heart.text.square.fill")
                        .font(.system(size: 65, weight: .light))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(Color(red: 1, green: 0.54, blue: 0.46),
                                         Color(red: 1, green: 0.77, blue: 0.55))
                        .padding(28)
                        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 30))

                    Text("VYRA")
                        .font(.system(size: 15, weight: .black, design: .rounded))
                        .tracking(5)
                        .foregroundStyle(.orange)

                    Text("Твоя жизнь.\nТвоя легенда.")
                        .font(.system(size: 37, weight: .heavy, design: .rounded))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)

                    Text("Разреши чтение данных Apple Здоровья.\nРеальная активность будет развивать твоего героя.")
                        .font(.system(size: 16))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.70))

                    VStack(alignment: .leading, spacing: 16) {
                        dataRow("figure.walk", "Шаги", "Прокачка выносливости")
                        dataRow("moon.stars.fill", "Сон", "Очки восстановления")
                        dataRow("dumbbell.fill", "Тренировки", "Силовые квесты и достижения")
                        dataRow("figure.run", "Дистанция", "Прогресс путешественника")
                    }
                    .padding(20)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 22))

                    Label("Только чтение. Данные остаются на iPhone.", systemImage: "lock.shield")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.55))

                    Spacer(minLength: 18)

                    Button(action: connect) {
                        Text("Подключить Apple Здоровье")
                            .frame(maxWidth: .infinity)
                            .padding(18)
                            .font(.system(size: 16, weight: .bold))
                            .background(LinearGradient(
                                colors: [Color(red: 1, green: 0.75, blue: 0.41),
                                         Color(red: 0.98, green: 0.46, blue: 0.38)],
                                startPoint: .leading, endPoint: .trailing),
                                in: RoundedRectangle(cornerRadius: 18))
                            .foregroundStyle(.black)
                    }

                    Button("Продолжить без подключения", action: skip)
                        .foregroundStyle(.white.opacity(0.65))
                        .font(.system(size: 14, weight: .medium))
                        .padding(.vertical, 10)
                }
                .padding(.horizontal, 23)
                .frame(maxWidth: 510, minHeight: geometry.size.height)
                .frame(maxWidth: .infinity)
            }
        }
        .background(
            RadialGradient(colors: [
                Color(red: 0.28, green: 0.17, blue: 0.25),
                Color(red: 0.06, green: 0.05, blue: 0.09)],
                center: .topTrailing, startRadius: 20, endRadius: 760)
            .ignoresSafeArea()
        )
    }

    @ViewBuilder
    private func dataRow(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 13) {
            Image(systemName: icon)
                .frame(width: 30)
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 16, weight: .bold))
                Text(detail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
            }
            Spacer()
            Image(systemName: "checkmark.circle")
                .foregroundStyle(.white.opacity(0.42))
        }
    }
}

struct GameWebView: UIViewRepresentable {
    @ObservedObject var health: HealthService

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "vyra")
        controller.addUserScript(WKUserScript(
            source: "window.VYRA_NATIVE = true;",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.063, green: 0.059, blue: 0.09, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView

        let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Resources")
            ?? Bundle.main.url(forResource: "index", withExtension: "html")
        if let url = url {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.loadHTMLString("<h2 style='color:white'>Не найден интерфейс VYRA</h2>", baseURL: nil)
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.pushSnapshot()
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: GameWebView
        weak var webView: WKWebView?
        private var ready = false
        private var lastSent = ""

        init(_ parent: GameWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            pushSnapshot()
            if UserDefaults.standard.bool(forKey: "vyra.health.requested") {
                parent.health.refresh()
            }
        }

        // Health data is never injected into a remote webpage.
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(url.isFileURL ? .allow : .cancel)
        }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }
            switch action {
            case "refreshHealth":
                parent.health.refresh()
            case "requestHealth":
                parent.health.requestAccess {
                    UserDefaults.standard.set(true, forKey: "vyra.health.requested")
                    self.parent.health.refresh()
                }
            default:
                break
            }
        }

        func pushSnapshot() {
            guard ready, let snapshot = parent.health.latest, let webView = webView,
                  let data = try? JSONEncoder().encode(snapshot),
                  let json = String(data: data, encoding: .utf8),
                  lastSent != json else { return }
            lastSent = json
            let js = "window.dispatchEvent(new CustomEvent('vyra-health', {detail: \(json)}));"
            webView.evaluateJavaScript(js) { _, error in
                if let error = error {
                    print("VYRA Health bridge: \(error.localizedDescription)")
                }
            }
        }
    }
}
