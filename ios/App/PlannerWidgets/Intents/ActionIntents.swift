// The buttons inside the widgets.
import AppIntents
import SwiftUI
import WidgetKit

struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete task"
    static var isDiscoverable = false

    @Parameter(title: "Task")
    var taskId: String

    @Parameter(title: "Done")
    var done: Bool

    init() {}

    init(taskId: String, done: Bool) {
        self.taskId = taskId
        self.done = done
    }

    func perform() async throws -> some IntentResult {
        await WidgetStore.shared.perform(.setDone(taskId: taskId, done: done, at: WidgetLogic.isoNow()))
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct AddCaloriesIntent: AppIntent {
    static var title: LocalizedStringResource = "Add calories"
    static var isDiscoverable = false

    @Parameter(title: "kcal")
    var kcal: Int

    init() {}

    init(kcal: Int) {
        self.kcal = kcal
    }

    func perform() async throws -> some IntentResult {
        let now = Date()
        await WidgetStore.shared.perform(.addCalories(
            id: "wcal_\(UUID().uuidString)", kcal: kcal,
            date: WidgetLogic.dayString(now), at: WidgetLogic.isoNow(now)))
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct UndoCaloriesIntent: AppIntent {
    static var title: LocalizedStringResource = "Undo calories"
    static var isDiscoverable = false

    @Parameter(title: "Entry")
    var entryId: String

    init() {}

    init(entryId: String) {
        self.entryId = entryId
    }

    func perform() async throws -> some IntentResult {
        await WidgetStore.shared.perform(.removeCalories(id: entryId, at: WidgetLogic.isoNow()))
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct NextPageIntent: AppIntent {
    static var title: LocalizedStringResource = "Next page"
    static var isDiscoverable = false

    @Parameter(title: "Page key")
    var key: String

    init() {}

    init(key: String) {
        self.key = key
    }

    func perform() async throws -> some IntentResult {
        await WidgetStore.shared.nextPage(key)
        return .result()
    }
}

/// Turns the views' taps into widget buttons and links.
func widgetButtons(pageKey: String) -> WidgetInteraction {
    { tap, label in
        switch tap {
        case .toggle(let taskId, let done):
            return AnyView(Button(intent: ToggleTaskIntent(taskId: taskId, done: done)) { label }.buttonStyle(.plain))
        case .addCalories(let kcal):
            return AnyView(Button(intent: AddCaloriesIntent(kcal: kcal)) { label }.buttonStyle(.plain))
        case .undoCalories(let entryId):
            return AnyView(Button(intent: UndoCaloriesIntent(entryId: entryId)) { label }.buttonStyle(.plain))
        case .nextPage:
            return AnyView(Button(intent: NextPageIntent(key: pageKey)) { label }.buttonStyle(.plain))
        case .open(let url):
            return AnyView(Link(destination: url) { label })
        }
    }
}
