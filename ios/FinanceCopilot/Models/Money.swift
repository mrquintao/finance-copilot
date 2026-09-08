import Foundation

struct Money: Decodable, Hashable, Sendable {
    let value: Decimal

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        guard text.range(of: #"^[0-9]{1,25}\.[0-9]{2}$"#, options: .regularExpression) != nil,
              let amount = Decimal(string: text, locale: Locale(identifier: "en_US_POSIX")) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid money.")
        }
        value = amount
    }

    // Swift Charts receives exact integer centavos; financial values never become Double.
    var minorUnits: Int64? {
        let cents = value * Decimal(100)
        guard cents <= Decimal(Int64.max) else { return nil }
        let result = NSDecimalNumber(decimal: cents).int64Value
        return Decimal(result) == cents ? result : nil
    }
}

@MainActor
enum BRLFormat {
    private static let formatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.numberStyle = .currency
        formatter.currencyCode = "BRL"
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter
    }()

    static func string(_ amount: Decimal) -> String {
        formatter.string(from: NSDecimalNumber(decimal: amount)) ?? "R$ —"
    }
}
