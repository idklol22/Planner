// Made-up data for the widget gallery, tests and rendered previews.
import Foundation

enum SampleData {
    static func widget(today: String) -> WidgetData {
        func shifted(_ days: Int) -> String {
            guard let base = WidgetLogic.parseDay(today) else { return today }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "UTC")!
            let date = calendar.date(byAdding: .day, value: days, to: base) ?? base
            return WidgetLogic.dayString(date, calendar: calendar)
        }
        func task(_ id: String, _ title: String, _ day: Int, _ subject: String?, done: Bool = false,
                  time: String? = nil, deadline: Bool = false, order: Double = 0, subtasks: (Int, Int) = (0, 0)) -> TaskItem {
            TaskItem(id: id, title: title, date: shifted(day), done: done, categoryId: subject, seriesId: nil,
                     time: time, deadline: deadline, order: order, subtasksDone: subtasks.0, subtasksTotal: subtasks.1)
        }
        return WidgetData(
            date: today,
            generatedAt: "\(today)T09:00:00.000Z",
            theme: nil,
            calories: CalorieSummary(eaten: 1240, goal: 2000,
                                     lastWidgetEntry: CalorieEntryRef(id: "wcal_sample0001", kcal: 250,
                                                                      at: "\(today)T08:00:00.000Z"),
                                     burned: 410, steps: 6820),
            categories: [
                PlannerSubject(id: "math", name: "Mathematics", color: "#7aa2ff", order: 0, goals: [
                    GoalItem(title: "Finish integration unit", done: false),
                    GoalItem(title: "Two past papers", done: false),
                    GoalItem(title: "Formula sheet", done: true)
                ]),
                PlannerSubject(id: "home", name: "Home", color: "#7bd88f", order: 1, goals: [])
            ],
            tasks: [
                task("t1", "Problem sheet 4", -1, "math", deadline: true, order: 0),
                task("t2", "Revise integration by parts", 0, "math", time: "10:00", order: 1, subtasks: (1, 3)),
                task("t3", "Watch lecture 12", 0, "math", order: 2),
                task("t4", "Buy groceries", 0, "home", order: 3),
                task("t5", "Call the electrician", 0, "home", order: 4),
                task("t6", "Tutorial questions", 1, "math", order: 5),
                task("t7", "Mock exam", 4, "math", deadline: true, order: 6),
                task("t8", "Read chapter 9", 6, "math", order: 7),
                task("t9", "Summarise lecture notes", 9, "math", order: 8),
                task("t10", "Office hours", 11, "math", time: "14:00", order: 9),
                task("t11", "Water the plants", 0, "home", done: true, order: 10)
            ])
    }
}
