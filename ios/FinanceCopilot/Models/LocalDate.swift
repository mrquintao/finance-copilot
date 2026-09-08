import Foundation

// A transaction date is a calendar day, not a timestamp. UTC prevents timezone shifts.
struct LocalDate: Decodable, Hashable, Comparable, Sendable {
    let rawValue: String

    init(rawValue: String) throws {
        let formatter = Self.formatter()
        guard let date = formatter.date(from: rawValue),
              formatter.string(from: date) == rawValue else {
            throw APIError.invalidResponse
        }
        self.rawValue = rawValue
    }

    init(date: Date) {
        rawValue = Self.formatter().string(from: date)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        try self.init(rawValue: container.decode(String.self))
    }

    var date: Date {
        // Every initializer validates or creates this exact date format.
        Self.formatter().date(from: rawValue)!
    }

    var display: String {
        let formatter = Self.formatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.dateFormat = "dd/MM/yyyy"
        return formatter.string(from: date)
    }

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }

    private static func formatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }
}

struct Period: Hashable, Sendable {
    var start: LocalDate
    var end: LocalDate

    var isValid: Bool { start <= end }
    var label: String { "\(start.display) – \(end.display)" }
    var queryItems: [URLQueryItem] {
        [URLQueryItem(name: "start_date", value: start.rawValue),
         URLQueryItem(name: "end_date", value: end.rawValue)]
    }

    static let demo = Period(
        start: try! LocalDate(rawValue: "2026-09-01"),
        end: try! LocalDate(rawValue: "2026-09-30")
    )

    static let allDemo = Period(
        start: try! LocalDate(rawValue: "2026-04-01"),
        end: try! LocalDate(rawValue: "2026-09-30")
    )

    static var currentMonth: Period {
        let localCalendar = Calendar(identifier: .gregorian)
        let components = localCalendar.dateComponents([.year, .month], from: Date())
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let start = calendar.date(from: components)!
        let nextMonth = calendar.date(byAdding: .month, value: 1, to: start)!
        let end = calendar.date(byAdding: .day, value: -1, to: nextMonth)!
        return Period(start: LocalDate(date: start), end: LocalDate(date: end))
    }
}
