// The widgets' connection to the Planner hub: cached data, queued taps and paging.
// Everything is kept in the widget extension's own storage (no app group needed).
import Foundation

enum WidgetLoad {
    case data(WidgetData, offline: Bool)
    /// No usable widget code yet.
    case needsCode
    case failed(title: String, detail: String)
}

actor WidgetStore {
    static let shared = WidgetStore()

    private let defaults = UserDefaults.standard
    private enum Key {
        static let credentials = "planner.widget.credentials"
        static let cache = "planner.widget.cache"
        static let freshUntil = "planner.widget.freshUntil"
        static let pending = "planner.widget.pending"
        static let recent = "planner.widget.recent"
    }

    /// How long a ticked task stays visible before it leaves the list.
    static let recentSeconds: TimeInterval = 90

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 12
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }()

    private func read<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func write<T: Encodable>(_ value: T, _ key: String) {
        defaults.set(try? JSONEncoder().encode(value), forKey: key)
    }

    private func request(_ credentials: HubCredentials, _ path: String, body: Data? = nil) async -> (Int, Data)? {
        guard let url = URL(string: credentials.url + path) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
        if let body = body {
            request.httpMethod = "POST"
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        guard let (data, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse else { return nil }
        return (http.statusCode, data)
    }

    // MARK: Loading

    /// `code` is what the user pasted into this widget; any widget that connected once connects the others.
    func load(code: String?, date: String) async -> WidgetLoad {
        let pasted = WidgetLogic.decodeCode(code)
        let saved = read(HubCredentials.self, Key.credentials)
        guard let credentials = pasted ?? saved else { return .needsCode }

        await flush(saved ?? credentials)
        let cached = read(WidgetData.self, Key.cache).flatMap { $0.date == date ? $0 : nil }
        // Straight after a tap, draw what we already know so the widget answers at once.
        if let cached = cached, Date().timeIntervalSince1970 < defaults.double(forKey: Key.freshUntil) {
            return .data(WidgetLogic.overlay(pendingActions(), on: cached), offline: false)
        }

        var attempt = await request(credentials, "/widget?date=\(date)")
        var used = credentials
        // An old code left in one widget must not break it while another has a working one.
        if attempt?.0 == 401, let saved = saved, saved != credentials {
            attempt = await request(saved, "/widget?date=\(date)")
            used = saved
        }
        guard let (status, body) = attempt else {
            if let cached = cached { return .data(WidgetLogic.overlay(pendingActions(), on: cached), offline: true) }
            return .failed(title: "No connection", detail: "The widget will try again shortly.")
        }
        if status == 401 || status == 403 {
            return .failed(title: "Code no longer works",
                           detail: "Create a new widget code in Planner › Settings and paste it here.")
        }
        guard status == 200, let data = try? JSONDecoder().decode(WidgetData.self, from: body) else {
            if let cached = cached { return .data(WidgetLogic.overlay(pendingActions(), on: cached), offline: true) }
            let detail = status == 404 ? "Your cloud needs the widget update." : "The cloud answered \(status)."
            return .failed(title: "Can't load", detail: detail)
        }
        write(used, Key.credentials)
        write(data, Key.cache)
        return .data(WidgetLogic.overlay(pendingActions(), on: data), offline: false)
    }

    /// The last data seen, for the subject list while offline.
    func cachedData() -> WidgetData? {
        read(WidgetData.self, Key.cache)
    }

    // MARK: Taps

    private func pendingActions() -> [PendingAction] {
        read([PendingAction].self, Key.pending) ?? []
    }

    func perform(_ action: PendingAction) async {
        write(pendingActions() + [action], Key.pending)
        if let cached = read(WidgetData.self, Key.cache) {
            write(WidgetLogic.apply(action, to: cached), Key.cache)
            defaults.set(Date().timeIntervalSince1970 + 15, forKey: Key.freshUntil)
        }
        if action.type == "task.set_done", let id = action.taskId {
            var recent = read([String: Double].self, Key.recent) ?? [:]
            if action.done == true { recent[id] = Date().timeIntervalSince1970 } else { recent[id] = nil }
            write(recent, Key.recent)
        }
        if let credentials = read(HubCredentials.self, Key.credentials) {
            await flush(credentials)
        }
    }

    /// Send queued taps in order. Stops at the first network failure and keeps the rest.
    private func flush(_ credentials: HubCredentials) async {
        while let action = pendingActions().first {
            guard let body = try? JSONEncoder().encode(action),
                  let (status, _) = await request(credentials, "/widget/action", body: body)
            else { return }
            // 4xx other than auth or rate limits can never succeed later: drop it.
            let delivered = (200..<300).contains(status)
            let hopeless = (400..<500).contains(status) && ![401, 403, 408, 429].contains(status)
            guard delivered || hopeless else { return }
            var queue = pendingActions()
            if let index = queue.firstIndex(of: action) { queue.remove(at: index) }
            write(queue, Key.pending)
        }
    }

    func recentlyDone(now: Date = Date()) -> Set<String> {
        let recent = read([String: Double].self, Key.recent) ?? [:]
        return Set(recent.filter { now.timeIntervalSince1970 - $0.value < Self.recentSeconds }.keys)
    }

    // MARK: Paging

    func page(_ key: String) -> Int {
        defaults.integer(forKey: "planner.widget.page.\(key)")
    }

    func nextPage(_ key: String) {
        defaults.set(page(key) + 1, forKey: "planner.widget.page.\(key)")
        // Paging needs no new data.
        defaults.set(Date().timeIntervalSince1970 + 15, forKey: Key.freshUntil)
    }
}
