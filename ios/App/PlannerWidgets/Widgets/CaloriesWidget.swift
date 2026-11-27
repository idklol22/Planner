import SwiftUI
import WidgetKit

struct CaloriesEntry: TimelineEntry {
    var date: Date
    var load: WidgetLoad
    var amounts: [Int]
}

struct CaloriesProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CaloriesEntry {
        sampleEntry()
    }

    func snapshot(for configuration: CaloriesWidgetIntent, in context: Context) async -> CaloriesEntry {
        let current = await entry(for: configuration)
        if context.isPreview, case .needsCode = current.load { return sampleEntry() }
        return current
    }

    func timeline(for configuration: CaloriesWidgetIntent, in context: Context) async -> Timeline<CaloriesEntry> {
        let current = await entry(for: configuration)
        return Timeline(entries: [current], policy: .after(nextRefresh(after: current.date)))
    }

    private func entry(for configuration: CaloriesWidgetIntent) async -> CaloriesEntry {
        let now = Date()
        let load = await WidgetStore.shared.load(code: configuration.code, date: WidgetLogic.dayString(now))
        return CaloriesEntry(date: now, load: load,
                             amounts: [configuration.first, configuration.second, configuration.third])
    }

    private func sampleEntry() -> CaloriesEntry {
        CaloriesEntry(date: Date(),
                      load: .data(SampleData.widget(today: WidgetLogic.dayString(Date())), offline: false),
                      amounts: [100, 250, 500])
    }
}

struct CaloriesEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: CaloriesEntry

    private var palette: WidgetPalette {
        if case .data(let data, _) = entry.load { return WidgetPalette(data.theme) }
        return WidgetPalette(nil)
    }

    var body: some View {
        content
            .containerBackground(for: .widget) { palette.bg }
            .widgetURL(URL(string: "planner://calories"))
    }

    @ViewBuilder
    private var content: some View {
        switch entry.load {
        case .needsCode:
            WidgetMessageView(icon: "link", title: "Connect to Planner",
                              detail: "Touch and hold, Edit Widget, then paste the code from Planner › Settings.",
                              palette: palette)
        case .failed(let title, let detail):
            WidgetMessageView(icon: "exclamationmark.icloud", title: title, detail: detail, palette: palette)
        case .data(let data, let offline):
            CaloriesWidgetView(calories: data.calories, amounts: entry.amounts, wide: family != .systemSmall,
                               offline: offline, palette: palette, interact: widgetButtons(pageKey: "calories"))
        }
    }
}

struct CaloriesWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "PlannerCalories", intent: CaloriesWidgetIntent.self,
                               provider: CaloriesProvider()) { entry in
            CaloriesEntryView(entry: entry)
        }
        .configurationDisplayName("Calories")
        .description("See today's calories and add more with one tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

@main
struct PlannerWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TasksWidget()
        CaloriesWidget()
    }
}
