import SwiftUI
import WidgetKit

struct TasksEntry: TimelineEntry {
    var date: Date
    var load: WidgetLoad
    var scope: ScopeOption
    var subjectId: String?
    var showGoals: Bool
    var showDone: Bool
    var recent: Set<String>
    var page: Int
    var pageKey: String
}

/// When to ask again: soon enough to follow other devices, and at midnight for the new day.
func nextRefresh(after now: Date) -> Date {
    let calendar = Calendar.current
    let midnight = calendar.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 5),
                                     matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)
    return min(now.addingTimeInterval(20 * 60), midnight)
}

struct TasksProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TasksEntry {
        sampleEntry()
    }

    func snapshot(for configuration: TasksWidgetIntent, in context: Context) async -> TasksEntry {
        // The widget gallery shows an example until the widget is set up.
        if context.isPreview && configuration.scope == .unset { return sampleEntry() }
        return await entry(for: configuration, context: context)
    }

    func timeline(for configuration: TasksWidgetIntent, in context: Context) async -> Timeline<TasksEntry> {
        let current = await entry(for: configuration, context: context)
        var entries = [current]
        if !current.recent.isEmpty {
            // A second picture, a little later, without the tasks that were just ticked.
            var settled = current
            settled.date = current.date.addingTimeInterval(WidgetStore.recentSeconds)
            settled.recent = []
            entries.append(settled)
        }
        return Timeline(entries: entries, policy: .after(nextRefresh(after: current.date)))
    }

    private func entry(for configuration: TasksWidgetIntent, context: Context) async -> TasksEntry {
        let now = Date()
        let load = await WidgetStore.shared.load(code: configuration.code, date: WidgetLogic.dayString(now))
        let key = [configuration.scope.rawValue, configuration.subject?.id ?? "-", "\(context.family.rawValue)"]
            .joined(separator: ".")
        return TasksEntry(
            date: now, load: load, scope: configuration.scope, subjectId: configuration.subject?.id,
            showGoals: configuration.showGoals, showDone: configuration.showDone,
            recent: await WidgetStore.shared.recentlyDone(now: now),
            page: await WidgetStore.shared.page(key), pageKey: key)
    }

    private func sampleEntry() -> TasksEntry {
        TasksEntry(date: Date(), load: .data(SampleData.widget(today: WidgetLogic.dayString(Date())), offline: false),
                   scope: .today, subjectId: nil, showGoals: true, showDone: false, recent: [], page: 0,
                   pageKey: "sample")
    }
}

struct TasksEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: TasksEntry

    private var palette: WidgetPalette {
        if case .data(let data, _) = entry.load { return WidgetPalette(data.theme) }
        return WidgetPalette(nil)
    }

    var body: some View {
        content
            .containerBackground(for: .widget) { palette.bg }
            .widgetURL(URL(string: "planner://today"))
    }

    @ViewBuilder
    private var content: some View {
        switch entry.load {
        case .needsCode:
            message("Connect to Planner",
                    "Touch and hold, Edit Widget, then paste the code from Planner › Settings.")
        case .failed(let title, let detail):
            message(title, detail)
        case .data(let data, let offline):
            if let scope = entry.scope.scope {
                if scope == .subject && !data.categories.contains(where: { $0.id == entry.subjectId }) {
                    message("Choose a subject", "Touch and hold, then Edit Widget.")
                } else {
                    TasksWidgetView(
                        model: WidgetLogic.tasksModel(
                            data: data, scope: scope, subjectId: entry.subjectId, showGoals: entry.showGoals,
                            showDone: entry.showDone, recent: entry.recent),
                        layout: family == .systemSmall ? .small : (family == .systemMedium ? .medium : .large),
                        page: entry.page, offline: offline, palette: palette,
                        interact: widgetButtons(pageKey: entry.pageKey))
                }
            } else {
                message("What should I show?",
                        "Touch and hold, Edit Widget: today, a subject, or everything.")
            }
        }
    }

    private func message(_ title: String, _ detail: String) -> some View {
        WidgetMessageView(title: title, detail: detail, palette: palette)
    }
}

struct TasksWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "PlannerTasks", intent: TasksWidgetIntent.self, provider: TasksProvider()) { entry in
            TasksEntryView(entry: entry)
        }
        .configurationDisplayName("Tasks")
        .description("Tick off tasks for today or a subject, with its goals.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}
