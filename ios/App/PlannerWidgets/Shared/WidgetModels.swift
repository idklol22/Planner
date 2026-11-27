// Data shapes shared by the widgets and their tests. See docs/WIDGET-CONTRACT.md.
// Foundation only: this file is also compiled on macOS by ios/WidgetTests.
import Foundation

struct WidgetData: Codable, Equatable {
    var date: String
    var generatedAt: String
    var theme: ThemeSpec?
    var calories: CalorieSummary
    var categories: [PlannerSubject]
    var tasks: [TaskItem]
}

struct ThemeSpec: Codable, Equatable {
    var bg: String
    var surface: String
    var text: String
    var muted: String
    var faint: String
    var accent: String
    var accentContrast: String
    var dark: Bool
}

struct CalorieSummary: Codable, Equatable {
    var eaten: Double
    var goal: Double?
    var lastWidgetEntry: CalorieEntryRef?
    var burned: Double?
    var steps: Double?
}

struct CalorieEntryRef: Codable, Equatable {
    var id: String
    var kcal: Double
    var at: String
}

/// A Planner category ("subject") with its pinned goals.
struct PlannerSubject: Codable, Equatable {
    var id: String
    var name: String
    var color: String
    var order: Double
    var goals: [GoalItem]
}

struct GoalItem: Codable, Equatable {
    var title: String
    var done: Bool
}

struct TaskItem: Codable, Equatable {
    var id: String
    var title: String
    var date: String
    var done: Bool
    var categoryId: String?
    var seriesId: String?
    var time: String?
    var deadline: Bool
    var order: Double
    var subtasksDone: Int
    var subtasksTotal: Int
}

/// A tap made on a widget, kept until the hub has accepted it.
struct PendingAction: Codable, Equatable {
    var type: String
    var taskId: String?
    var done: Bool?
    var id: String?
    var kcal: Int?
    var date: String?
    var at: String

    static func setDone(taskId: String, done: Bool, at: String) -> PendingAction {
        PendingAction(type: "task.set_done", taskId: taskId, done: done, at: at)
    }

    static func addCalories(id: String, kcal: Int, date: String, at: String) -> PendingAction {
        PendingAction(type: "calories.add", id: id, kcal: kcal, date: date, at: at)
    }

    static func removeCalories(id: String, at: String) -> PendingAction {
        PendingAction(type: "calories.remove", id: id, at: at)
    }
}

struct HubCredentials: Codable, Equatable {
    var url: String
    var token: String
}
