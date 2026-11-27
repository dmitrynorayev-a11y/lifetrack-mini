import test from "node:test";
import assert from "node:assert/strict";
import { dateKey, normalizeDailySum, normalizeSleep, normalizeWorkouts, firstDay } from "./health-logic.js";

test("dateKey and start of range", () => {
  assert.match(dateKey(new Date("2026-11-27T10:00:00Z")), /^\d{4}-\d\d-\d\d$/);
  const d = firstDay(14, new Date("2026-11-27T15:00:00Z"));
  assert.equal(d.getHours(), 0);
});
test("steps combine buckets and discard invalid values", () => {
  const d = new Date(2026, 10, 27, 12);
  const samples=[{startDate:d.toISOString(),value:1000},{startDate:d.toISOString(),value:2500},{startDate:d.toISOString(),value:-50}];
  assert.equal(normalizeDailySum(samples)[dateKey(d)], 3500);
});
test("sleep sums stages without counting awake, inBed, or duplicate watch intervals", () => {
  const sleep=[
    {sleepState:"inBed",startDate:"2026-11-26T21:00:00",endDate:"2026-11-27T07:00:00"},
    {sleepState:"deep",startDate:"2026-11-26T23:00:00",endDate:"2026-11-27T02:00:00"},
    {sleepState:"asleep",startDate:"2026-11-26T23:30:00",endDate:"2026-11-27T04:00:00"},
    {sleepState:"rem",startDate:"2026-11-27T04:00:00",endDate:"2026-11-27T06:00:00"},
    {sleepState:"awake",startDate:"2026-11-27T06:00:00",endDate:"2026-11-27T07:00:00"},
  ];
  assert.equal(normalizeSleep(sleep)["2026-11-27"],7);
});
test("stage samples do not count parent interval twice",()=>{
  const samples=[{sleepState:"asleep",startDate:"2026-11-27T01:00:00",endDate:"2026-11-27T05:00:00",stages:[{stage:"deep",startDate:"2026-11-27T01:00:00",endDate:"2026-11-27T02:00:00"},{stage:"awake",startDate:"2026-11-27T02:00:00",endDate:"2026-11-27T03:00:00"},{stage:"light",startDate:"2026-11-27T03:00:00",endDate:"2026-11-27T05:00:00"}]}];
  assert.equal(normalizeSleep(samples)["2026-11-27"],3);
});
test("evening sleep assigned to following morning",()=>{
  const d=normalizeSleep([{sleepState:"asleep",startDate:"2026-11-26T22:00:00",endDate:"2026-11-26T23:00:00"}]);
  assert.equal(d["2026-11-27"],1);
});
test("workout deduplication",()=>{
  const w=[{platformId:"A",startDate:"2026-11-27T10:00:00",endDate:"2026-11-27T11:00:00"},{platformId:"A",endDate:"2026-11-27T11:00:00"},{platformId:"B",endDate:"2026-11-27T17:00:00"}];
  assert.equal(normalizeWorkouts(w)["2026-11-27"],2);
});
