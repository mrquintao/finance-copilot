import Foundation

struct SyncRun: Decodable, Sendable {
    let id: UUID
    let status: String
    let transactionsCreated: Int
    let transactionsUpdated: Int
    let error: String?
}

struct SyncRuns: Decodable, Sendable {
    let items: [SyncRun]
}

struct FinanceService: Sendable {
    let client: APIClient

    var connectURL: URL {
        client.baseURL.appendingPathComponent("sync/connect")
    }

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

    func refreshOpenFinance() async throws -> SyncRuns {
        try await client.post("sync/refresh")
    }
}
