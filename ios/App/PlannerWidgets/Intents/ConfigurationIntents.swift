// What "Edit Widget" asks: the widget code, what to show and which subject.
import AppIntents
import WidgetKit

enum ScopeOption: String, AppEnum {
    case unset, today, subject, all

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "View"
    static var caseDisplayRepresentations: [ScopeOption: DisplayRepresentation] = [
        .unset: "Choose…",
        .today: "Today's tasks",
        .subject: "One subject (goals and tasks)",
        .all: "All open tasks"
    ]

    var scope: TaskScope? {
        TaskScope(rawValue: rawValue)
    }
}

struct SubjectEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Subject"
    static var defaultQuery = SubjectQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct SubjectQuery: EntityQuery {
    /// Lets the list load as soon as the code is pasted, in the same sheet.
    @IntentParameterDependency<TasksWidgetIntent>(\.$code)
    var tasksIntent

    private func subjects() async -> [SubjectEntity] {
        let result = await WidgetStore.shared.load(code: tasksIntent?.code, date: WidgetLogic.dayString(Date()))
        var data: WidgetData?
        if case .data(let loaded, _) = result { data = loaded }
        if data == nil { data = await WidgetStore.shared.cachedData() }
        return (data?.categories ?? []).map { SubjectEntity(id: $0.id, name: $0.name) }
    }

    func entities(for identifiers: [String]) async throws -> [SubjectEntity] {
        let known = await subjects()
        // Keep the saved choice even when the list cannot be loaded right now.
        return identifiers.map { id in known.first { $0.id == id } ?? SubjectEntity(id: id, name: "Saved subject") }
    }

    func suggestedEntities() async throws -> [SubjectEntity] {
        await subjects()
    }
}

struct TasksWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Tasks"
    static var description = IntentDescription("Choose what this widget shows.")

    @Parameter(title: "Widget code", description: "From Planner › Settings. Needed in one widget only.")
    var code: String?

    @Parameter(title: "Show", default: .unset)
    var scope: ScopeOption

    @Parameter(title: "Subject")
    var subject: SubjectEntity?

    @Parameter(title: "Show goals", default: true)
    var showGoals: Bool

    @Parameter(title: "Keep finished tasks", default: false)
    var showDone: Bool

    static var parameterSummary: some ParameterSummary {
        When(\TasksWidgetIntent.$scope, .equalTo, ScopeOption.subject) {
            Summary {
                \TasksWidgetIntent.$code
                \TasksWidgetIntent.$scope
                \TasksWidgetIntent.$subject
                \TasksWidgetIntent.$showGoals
                \TasksWidgetIntent.$showDone
            }
        } otherwise: {
            Summary {
                \TasksWidgetIntent.$code
                \TasksWidgetIntent.$scope
                \TasksWidgetIntent.$showDone
            }
        }
    }
}

struct CaloriesWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Calories"
    static var description = IntentDescription("Set your quick-add amounts.")

    @Parameter(title: "Widget code", description: "From Planner › Settings. Needed in one widget only.")
    var code: String?

    @Parameter(title: "First button (kcal)", default: 100, inclusiveRange: (1, 5000))
    var first: Int

    @Parameter(title: "Second button (kcal)", default: 250, inclusiveRange: (1, 5000))
    var second: Int

    @Parameter(title: "Third button (kcal)", default: 500, inclusiveRange: (1, 5000))
    var third: Int
}
