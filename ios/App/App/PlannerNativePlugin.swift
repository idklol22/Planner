// The app's native bridge: refresh the Home Screen widgets and read Apple Health.
// JavaScript side: src/native/planner-native.ts
import Capacitor
import Foundation
import HealthKit
import WidgetKit

@objc(PlannerNativePlugin)
public class PlannerNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlannerNativePlugin"
    public let jsName = "PlannerNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "reloadWidgets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readHealth", returnType: CAPPluginReturnPromise)
    ]

    private lazy var health = HealthReader()

    @objc func reloadWidgets(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    @objc func readHealth(_ call: CAPPluginCall) {
        let days = min(max(call.getInt("days") ?? 7, 1), 31)
        health.read(days: days) { result in
            switch result {
            case .success(let rows):
                call.resolve(["days": rows])
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }
}

private struct HealthError: LocalizedError {
    var errorDescription: String?
}

/// Daily totals for the last few days, in the shape of the app's health rows.
private final class HealthReader {
    private let store = HKHealthStore()
    private let calendar = Calendar.current
    /// Results arrive on background queues; they are collected on this one.
    private let collect = DispatchQueue(label: "dev.planner.health")

    private func quantity(_ id: HKQuantityTypeIdentifier) -> HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: id)
    }

    func read(days: Int, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(HealthError(errorDescription: "Health is not available on this device.")))
            return
        }
        var types = Set<HKObjectType>([HKObjectType.workoutType()])
        for id: HKQuantityTypeIdentifier in [.activeEnergyBurned, .stepCount, .appleExerciseTime,
                                             .distanceWalkingRunning, .restingHeartRate] {
            if let type = quantity(id) { types.insert(type) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }

        store.requestAuthorization(toShare: nil, read: types) { granted, error in
            if let error = error {
                completion(.failure(HealthError(errorDescription:
                    "Apple Health refused access: \(error.localizedDescription)")))
                return
            }
            guard granted else {
                completion(.failure(HealthError(errorDescription: "Apple Health access was not granted.")))
                return
            }
            self.gather(days: days, completion: completion)
        }
    }

    private func dayKey(_ date: Date) -> String {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        let parts = gregorian.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private func gather(days: Int, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let now = Date()
        let today = calendar.startOfDay(for: now)
        guard let start = calendar.date(byAdding: .day, value: -(days - 1), to: today) else {
            completion(.failure(HealthError(errorDescription: "Could not work out the dates.")))
            return
        }
        var values: [String: [String: Double]] = [:]
        var workouts: [String: [[String: Any]]] = [:]
        let group = DispatchGroup()

        func set(_ key: String, _ day: String, _ value: Double) {
            var row = values[day] ?? [:]
            row[key] = value
            values[day] = row
        }

        let totals: [(String, HKQuantityTypeIdentifier, HKUnit, Bool)] = [
            ("activeKcal", .activeEnergyBurned, .kilocalorie(), true),
            ("steps", .stepCount, .count(), true),
            ("exerciseMin", .appleExerciseTime, .minute(), true),
            ("distanceKm", .distanceWalkingRunning, .meterUnit(with: .kilo), true),
            ("restingHr", .restingHeartRate, HKUnit.count().unitDivided(by: .minute()), false)
        ]
        for (key, id, unit, sum) in totals {
            guard let type = quantity(id) else { continue }
            group.enter()
            let query = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: now),
                options: sum ? .cumulativeSum : .discreteAverage,
                anchorDate: today,
                intervalComponents: DateComponents(day: 1))
            query.initialResultsHandler = { _, results, _ in
                self.collect.async {
                    results?.enumerateStatistics(from: start, to: now) { statistics, _ in
                        let amount = sum ? statistics.sumQuantity() : statistics.averageQuantity()
                        if let amount = amount {
                            let raw = amount.doubleValue(for: unit)
                            let value = key == "distanceKm" ? (raw * 100).rounded() / 100 : raw.rounded()
                            set(key, self.dayKey(statistics.startDate), value)
                        }
                    }
                    group.leave()
                }
            }
            store.execute(query)
        }

        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
           let earlier = calendar.date(byAdding: .day, value: -1, to: start) {
            group.enter()
            let query = HKSampleQuery(
                sampleType: sleepType,
                predicate: HKQuery.predicateForSamples(withStart: earlier, end: now),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, _ in
                self.collect.async {
                    // 1 = asleep, 3...5 = core, deep and REM. "In bed" and "awake" are not sleep.
                    let asleep = (samples as? [HKCategorySample] ?? []).filter { [1, 3, 4, 5].contains($0.value) }
                    // The watch and the phone can both record a night: merge overlaps before adding up.
                    var merged: [(Date, Date)] = []
                    for sample in asleep {
                        if let last = merged.last, sample.startDate <= last.1 {
                            merged[merged.count - 1].1 = max(last.1, sample.endDate)
                        } else {
                            merged.append((sample.startDate, sample.endDate))
                        }
                    }
                    var hours: [String: Double] = [:]
                    for (from, to) in merged where to >= start {
                        // A night counts for the day you wake up on.
                        hours[self.dayKey(to), default: 0] += to.timeIntervalSince(from) / 3600
                    }
                    for (day, value) in hours {
                        set("sleepHours", day, min((value * 10).rounded() / 10, 24))
                    }
                    group.leave()
                }
            }
            store.execute(query)
        }

        group.enter()
        let workoutQuery = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: HKQuery.predicateForSamples(withStart: start, end: now),
            limit: 200,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        ) { _, samples, _ in
            self.collect.async {
                for workout in samples as? [HKWorkout] ?? [] {
                    let kcal: Any = workout.totalEnergyBurned.map { $0.doubleValue(for: .kilocalorie()).rounded() }
                        ?? NSNull()
                    workouts[self.dayKey(workout.startDate), default: []].append([
                        "type": Self.name(workout.workoutActivityType),
                        "minutes": (workout.duration / 60).rounded(),
                        "kcal": kcal
                    ])
                }
                group.leave()
            }
        }
        store.execute(workoutQuery)

        group.notify(queue: collect) {
            let keys = ["activeKcal", "steps", "exerciseMin", "distanceKm", "sleepHours", "restingHr"]
            let found = Set(values.keys).union(workouts.keys).sorted()
            let rows: [[String: Any]] = found.map { day in
                var row: [String: Any] = ["date": day, "workouts": Array((workouts[day] ?? []).prefix(50))]
                for key in keys {
                    if let value = values[day]?[key] { row[key] = value } else { row[key] = NSNull() }
                }
                return row
            }
            completion(.success(rows))
        }
    }

    private static func name(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .walking: return "Walking"
        case .running: return "Running"
        case .cycling: return "Cycling"
        case .swimming: return "Swimming"
        case .yoga: return "Yoga"
        case .hiking: return "Hiking"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "Strength"
        case .highIntensityIntervalTraining: return "HIIT"
        default: return "Workout"
        }
    }
}
