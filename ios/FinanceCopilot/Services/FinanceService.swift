import Foundation

struct FinanceService: Sendable {
    let client: APIClient

    func summary(for period: Period) async throws -> SpendingSummary {
        guard period.isValid else { throw APIError.invalidPeriod }
        return try await client.get("analytics/spending-summary", query: period.queryItems)
    }

    func categories(for period: Period) async throws -> SpendingByCategory {
        guard period.isValid else { throw APIError.invalidPeriod }
        return try await client.get("analytics/spending-by-category", query: period.queryItems)
    }

    func transactions(for period: Period, offset: Int = 0) async throws -> TransactionPage {
        guard period.isValid else { throw APIError.invalidPeriod }
        return try await client.get("transactions", query: period.queryItems + [
            URLQueryItem(name: "limit", value: "50"),
            URLQueryItem(name: "offset", value: String(offset)),
        ])
    }

    func transaction(id: UUID) async throws -> Transaction {
        try await client.get("transactions/\(id.uuidString)")
    }
}
