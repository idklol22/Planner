// Pure widget rules: what to show, in what order, and what a tap changes.
// Foundation only, so ios/WidgetTests can check it on macOS.
import Foundation

enum TaskScope: String, Codable {
    case today, subject, all
}

struct TaskRowModel: Equatable, Identifiable {
    var id: String
    var title: String
    var done: Bool
    /// Hex colour of the task's subject; nil when it has none.
    var color: String?
    /// Short trailing text: a date, a time or subtask progress.
    var detail: String
    var overdue: Bool
    var deadline: Bool
}

struct TasksModel: Equatable {
    var title: String
    var color: String?
    var openCount: Int
    var goals: [GoalItem]
    var rows: [TaskRowModel]
}

struct Page<Element> {
    var items: [Element]
    var index: Int
    var count: Int
    /// Items not on this page.
    var hidden: Int
}

enum WidgetLogic {
    // MARK: Widget code

    /// "PLW1." + base64url(JSON {"u": url, "t": token}).
    static func decodeCode(_ raw: String?) -> HubCredentials? {
        guard let raw = raw else { return nil }
        let compact = raw.components(separatedBy: .whitespacesAndNewlines).joined()
        guard compact.hasPrefix("PLW1.") else { return nil }
        var body = String(compact.dropFirst(5))
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while body.count % 4 != 0 { body += "=" }
        guard let data = Data(base64Encoded: body),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              var url = object["u"] as? String,
              let token = object["t"] as? String,
              !token.isEmpty,
              url.hasPrefix("https://") || url.hasPrefix("http://")
        else { return nil }
        while url.hasSuffix("/") { url.removeLast() }
        return HubCredentials(url: url, token: token)
    }

    // MARK: Dates

    private static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    static func parseDay(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// Today's local calendar day.
    static func dayString(_ date: Date, calendar: Calendar = .current) -> String {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = calendar.timeZone
        let parts = local.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func dayDistance(from today: String, to day: String) -> Int {
        guard let a = parseDay(today), let b = parseDay(day) else { return 0 }
        return utc.dateComponents([.day], from: a, to: b).day ?? 0
    }

    /// "Yesterday", "Tomorrow", a weekday within a week, otherwise "3 Dec".
    static func dayLabel(_ day: String, today: String) -> String {
        let distance = dayDistance(from: today, to: day)
        if distance == 0 { return "Today" }
        if distance == 1 { return "Tomorrow" }
        if distance == -1 { return "Yesterday" }
        guard let date = parseDay(day) else { return day }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = distance > 1 && distance < 7 ? "EEE" : "d MMM"
        return formatter.string(from: date)
    }

    static func isoNow(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    // MARK: Tasks

    /// Show one occurrence per repeating task: today's if open, else the next one, else the latest missed one.
    private static func collapseRepeats(_ tasks: [TaskItem], today: String) -> [TaskItem] {
        var chosen: [String: TaskItem] = [:]
        func rank(_ task: TaskItem) -> (Int, Int) {
            let distance = dayDistance(from: today, to: task.date)
            if distance == 0 { return (0, 0) }
            return distance > 0 ? (1, distance) : (2, -distance)
        }
        for task in tasks where !task.done {
            guard let series = task.seriesId else { continue }
            if let current = chosen[series], rank(current) <= rank(task) { continue }
            chosen[series] = task
        }
        return tasks.filter { task in
            guard let series = task.seriesId, !task.done else { return true }
            return chosen[series]?.id == task.id
        }
    }

    /// `recent` holds tasks just ticked on a widget: they stay visible, in place, so a mistake can be undone.
    static func tasksModel(
        data: WidgetData,
        scope: TaskScope,
        subjectId: String?,
        showGoals: Bool,
        showDone: Bool,
        recent: Set<String>
    ) -> TasksModel {
        let today = data.date
        let subjects = Dictionary(data.categories.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let subject = scope == .subject ? subjectId.flatMap { subjects[$0] } : nil

        var pool = data.tasks
        if scope == .subject { pool = pool.filter { $0.categoryId == subjectId } }
        // A repeat ticked a moment ago must not be replaced by nothing: collapse only the open ones.
        pool = collapseRepeats(pool, today: today)

        let open = pool.filter { task in
            !task.done && (scope != .today || task.date <= today)
        }
        let finished = pool.filter { task in
            guard task.done else { return false }
            if recent.contains(task.id) { return true }
            guard showDone else { return false }
            return scope == .today ? task.date == today : task.date >= today
        }

        func byDay(_ a: TaskItem, _ b: TaskItem) -> Bool {
            if a.date != b.date { return a.date < b.date }
            if (a.time ?? "~") != (b.time ?? "~") { return (a.time ?? "~") < (b.time ?? "~") }
            if a.order != b.order { return a.order < b.order }
            return a.id < b.id
        }
        let inPlace = finished.filter { recent.contains($0.id) }
        let bottom = finished.filter { !recent.contains($0.id) }.sorted(by: byDay)
        let ordered = (open + inPlace).sorted(by: byDay) + bottom

        let rows = ordered.map { task -> TaskRowModel in
            var details: [String] = []
            if task.date != today { details.append(dayLabel(task.date, today: today)) }
            if let time = task.time, !time.isEmpty { details.append(time) }
            if task.subtasksTotal > 0 { details.append("\(task.subtasksDone)/\(task.subtasksTotal)") }
            return TaskRowModel(
                id: task.id,
                title: task.title,
                done: task.done,
                color: task.categoryId.flatMap { subjects[$0]?.color },
                detail: details.joined(separator: " · "),
                overdue: !task.done && task.date < today,
                deadline: task.deadline
            )
        }

        let title: String
        switch scope {
        case .today: title = "Today"
        case .all: title = "All tasks"
        case .subject: title = subject?.name ?? "Subject"
        }
        let goals = scope == .subject && showGoals ? (subject?.goals ?? []) : []
        // Open goals first: they are what is left to do.
        let orderedGoals = goals.filter { !$0.done } + goals.filter { $0.done }
        return TasksModel(title: title, color: subject?.color, openCount: open.count, goals: orderedGoals, rows: rows)
    }

    /// Split rows into pages. With `reservePager` one line is kept for the page button when not everything fits.
    static func page<Element>(_ items: [Element], capacity: Int, requested: Int,
                              reservePager: Bool = true) -> Page<Element> {
        let room = max(capacity, 1)
        if items.count <= room { return Page(items: items, index: 0, count: 1, hidden: 0) }
        let size = reservePager ? max(room - 1, 1) : room
        let count = (items.count + size - 1) / size
        let index = ((requested % count) + count) % count
        let start = index * size
        let slice = Array(items[start..<min(start + size, items.count)])
        return Page(items: slice, index: index, count: count, hidden: items.count - slice.count)
    }

    // MARK: Taps

    /// What the data looks like once `action` is accepted. Safe to apply twice.
    static func apply(_ action: PendingAction, to data: WidgetData) -> WidgetData {
        var next = data
        switch action.type {
        case "task.set_done":
            if let done = action.done {
                next.tasks = next.tasks.map { task in
                    var copy = task
                    if copy.id == action.taskId { copy.done = done }
                    return copy
                }
            }
        case "calories.add":
            if let id = action.id, let kcal = action.kcal, action.date == data.date,
               data.calories.lastWidgetEntry?.id != id,
               // The hub may already include it when its answer was lost.
               (data.calories.lastWidgetEntry?.at ?? "") < action.at {
                next.calories.eaten += Double(kcal)
                next.calories.lastWidgetEntry = CalorieEntryRef(id: id, kcal: Double(kcal), at: action.at)
            }
        case "calories.remove":
            if let entry = data.calories.lastWidgetEntry, entry.id == action.id {
                next.calories.eaten = max(next.calories.eaten - entry.kcal, 0)
                next.calories.lastWidgetEntry = nil
            }
        default:
            break
        }
        return next
    }

    static func overlay(_ pending: [PendingAction], on data: WidgetData) -> WidgetData {
        pending.reduce(data) { apply($1, to: $0) }
    }

    // MARK: Formatting

    static func number(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "\(Int(value))"
    }
}
