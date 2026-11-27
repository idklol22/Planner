// Runs on a Mac (CI): checks the widget rules and draws the widgets to one picture.
//   swiftc ios/App/PlannerWidgets/Shared/*.swift ios/App/PlannerWidgets/Views/*.swift ios/WidgetTests/main.swift
import Foundation
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

var failures = 0
func check(_ condition: Bool, _ what: String) {
    if !condition {
        failures += 1
        print("::error::widget test failed: \(what)")
    }
}

let today = "2026-11-27"
let sample = SampleData.widget(today: today)

// Widget code
let payload = Data(#"{"u":"https://hub.example/functions/v1/hub/","t":"abc123"}"#.utf8).base64EncodedString()
    .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
let credentials = WidgetLogic.decodeCode("  PLW1.\(payload)\n")
check(credentials == HubCredentials(url: "https://hub.example/functions/v1/hub", token: "abc123"), "code decodes")
check(WidgetLogic.decodeCode("hello") == nil, "bad code rejected")
check(WidgetLogic.decodeCode(nil) == nil, "missing code rejected")

// Dates
check(WidgetLogic.dayLabel("2026-11-26", today: today) == "Yesterday", "yesterday label")
check(WidgetLogic.dayLabel("2026-11-28", today: today) == "Tomorrow", "tomorrow label")
check(WidgetLogic.dayLabel("2026-12-01", today: today) == "Tue", "weekday label")
check(WidgetLogic.dayLabel("2026-12-08", today: today) == "8 Dec", "date label")

// Scopes
func model(_ data: WidgetData, _ scope: TaskScope, _ subject: String? = nil, done: Bool = false,
           recent: Set<String> = []) -> TasksModel {
    WidgetLogic.tasksModel(data: data, scope: scope, subjectId: subject, showGoals: true, showDone: done, recent: recent)
}
let todayModel = model(sample, .today)
check(todayModel.rows.map(\.id) == ["t1", "t2", "t3", "t4", "t5"], "today shows overdue then today")
check(todayModel.rows[0].overdue, "yesterday is overdue")
check(todayModel.openCount == 5, "today count")
check(model(sample, .today, done: true).rows.last?.id == "t11", "finished task at the bottom")
let math = model(sample, .subject, "math")
check(math.title == "Mathematics", "subject title")
check(math.goals.map(\.done) == [false, false, true], "open goals first")
check(math.rows.map(\.id) == ["t1", "t2", "t3", "t6", "t7", "t8", "t9", "t10"], "subject shows every open task")
check(model(sample, .all).rows.count == 10, "all shows every open task")
check(model(sample, .today).goals.isEmpty, "no goals outside a subject")

// Repeating tasks show once
var repeating = sample
repeating.tasks = [-1, 0, 1, 2].map { offset in
    TaskItem(id: "r\(offset)", title: "Stretch", date: "2026-11-\(27 + offset)", done: false, categoryId: nil,
             seriesId: "series", time: nil, deadline: false, order: 0, subtasksDone: 0, subtasksTotal: 0)
}
check(model(repeating, .all).rows.map(\.id) == ["r0"], "one occurrence per repeating task")

// Taps
let tick = PendingAction.setDone(taskId: "t2", done: true, at: "2026-11-27T10:00:00.000Z")
let ticked = WidgetLogic.apply(tick, to: sample)
check(ticked.tasks.first { $0.id == "t2" }?.done == true, "tick completes")
check(!model(ticked, .today).rows.contains { $0.id == "t2" }, "finished task leaves the list")
let kept = model(ticked, .today, recent: ["t2"])
check(kept.rows.map(\.id) == ["t1", "t2", "t3", "t4", "t5"], "just ticked task stays in place")
check(kept.openCount == 4, "count drops at once")

let add = PendingAction.addCalories(id: "wcal_test00000001", kcal: 300, date: today, at: "2026-11-27T11:00:00.000Z")
let added = WidgetLogic.apply(add, to: sample)
check(added.calories.eaten == 1540, "calories added")
check(WidgetLogic.apply(add, to: added).calories.eaten == 1540, "adding twice counts once")
let removed = WidgetLogic.apply(.removeCalories(id: "wcal_test00000001", at: "2026-11-27T11:01:00.000Z"), to: added)
check(removed.calories.eaten == 1240 && removed.calories.lastWidgetEntry == nil, "undo removes the entry")
var otherDay = add
otherDay.date = "2026-11-26"
check(WidgetLogic.apply(otherDay, to: sample).calories.eaten == 1240, "another day's calories ignored")

// Paging
let numbers = Array(1...10)
let first = WidgetLogic.page(numbers, capacity: 4, requested: 0)
check(first.items == [1, 2, 3] && first.count == 4 && first.hidden == 7, "first page leaves room for the pager")
check(WidgetLogic.page(numbers, capacity: 4, requested: 3).items == [10], "last page")
check(WidgetLogic.page(numbers, capacity: 4, requested: 4).items == [1, 2, 3], "pages wrap around")
check(WidgetLogic.page(numbers, capacity: 20, requested: 5).count == 1, "everything fits")

// The hub's JSON decodes.
let wire = """
{"date":"2026-11-27","generatedAt":"x","theme":null,
 "calories":{"eaten":0,"goal":null,"lastWidgetEntry":null,"burned":null,"steps":null},
 "categories":[{"id":"c","name":"C","color":"#fff","order":0,"goals":[]}],
 "tasks":[{"id":"a","title":"A","date":"2026-11-27","done":false,"categoryId":null,"seriesId":null,"time":null,
           "deadline":false,"order":1,"subtasksDone":0,"subtasksTotal":0}]}
"""
check((try? JSONDecoder().decode(WidgetData.self, from: Data(wire.utf8))) != nil, "hub answer decodes")
check(Color(css: "rgba(109,240,160,0.24)") != nil && Color(css: "#6df0a0") != nil, "colours parse")

// Rendered previews at iPhone 15 widget sizes.
struct Tile: View {
    var label: String
    var size: CGSize
    var palette: WidgetPalette
    var content: AnyView

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            content
                .frame(width: size.width, height: size.height)
                .background(palette.bg)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.white)
        }
    }
}

let smallSize = CGSize(width: 158, height: 158)
let mediumSize = CGSize(width: 338, height: 158)
let largeSize = CGSize(width: 338, height: 354)
let plain: WidgetInteraction = { _, label in label }
let dark = WidgetPalette(nil)
let light = WidgetPalette(ThemeSpec(bg: "#eef3ff", surface: "#ffffff", text: "#10203f", muted: "#45577d",
                                    faint: "#6c7c9e", accent: "#1d5fd6", accentContrast: "#ffffff", dark: false))

func tasksTile(_ label: String, _ layout: TasksLayout, _ model: TasksModel, page: Int = 0,
               palette: WidgetPalette = dark) -> Tile {
    let size = layout == .small ? smallSize : (layout == .medium ? mediumSize : largeSize)
    return Tile(label: label, size: size, palette: palette, content: AnyView(
        TasksWidgetView(model: model, layout: layout, page: page, offline: false, palette: palette, interact: plain)))
}

func caloriesTile(_ label: String, wide: Bool, _ calories: CalorieSummary, palette: WidgetPalette = dark) -> Tile {
    Tile(label: label, size: wide ? mediumSize : smallSize, palette: palette, content: AnyView(
        CaloriesWidgetView(calories: calories, amounts: [100, 250, 500], wide: wide, offline: false,
                           palette: palette, interact: plain)))
}

var overGoal = sample.calories
overGoal.eaten = 2460
overGoal.lastWidgetEntry = nil
var cleared = model(sample, .today)
cleared.rows = []
cleared.openCount = 0

/// GitHub shows only small notices, so each column is its own picture of at most `limit` bytes.
@MainActor
func writePicture(_ column: AnyView, to path: String, limit: Int) {
    let framed = column
        .padding(14)
        .background(Color(.sRGB, red: 0.22, green: 0.24, blue: 0.3, opacity: 1))
        .environment(\.colorScheme, .dark)
    for (scale, quality) in [(1.5, 0.7), (1.5, 0.5), (1.25, 0.5), (1.0, 0.55), (1.0, 0.35), (0.85, 0.35)] {
        let renderer = ImageRenderer(content: framed)
        renderer.scale = CGFloat(scale)
        let data = NSMutableData()
        guard let image = renderer.cgImage,
              let destination = CGImageDestinationCreateWithData(
                  data as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil)
        else { break }
        CGImageDestinationAddImage(destination, image,
                                   [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { break }
        if data.length <= limit || scale < 0.9 {
            check(data.write(toFile: path, atomically: true), "preview written")
            return
        }
    }
    check(false, "preview rendered")
}

MainActor.assumeIsolated {
    let columns: [AnyView] = [
        AnyView(VStack(alignment: .leading, spacing: 14) {
            tasksTile("Large · subject", .large, math)
            tasksTile("Medium · subject", .medium, math)
            tasksTile("Medium · today, one just ticked", .medium, kept)
        }),
        AnyView(VStack(alignment: .leading, spacing: 14) {
            tasksTile("Large · all tasks, light theme", .large, model(sample, .all), palette: light)
            caloriesTile("Calories · medium", wide: true, sample.calories)
            caloriesTile("Calories · medium, over goal, light", wide: true, overGoal, palette: light)
        }),
        AnyView(VStack(alignment: .leading, spacing: 14) {
            tasksTile("Small · today", .small, todayModel)
            tasksTile("Small · all clear", .small, cleared)
            caloriesTile("Calories · small", wide: false, sample.calories)
            Tile(label: "Setup", size: smallSize, palette: dark, content: AnyView(WidgetMessageView(
                icon: "link", title: "Connect to Planner",
                detail: "Touch and hold, Edit Widget, then paste the code from Planner › Settings.", palette: dark)))
        })
    ]
    let folder = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
    for (index, column) in columns.enumerated() {
        writePicture(column, to: "\(folder)/widgets-\(index + 1).jpg", limit: 29000)
    }
}

if failures > 0 {
    print("\(failures) widget test(s) failed")
    exit(1)
}
print("widget tests passed")
