import Foundation

struct SpendingSummary: Decodable, Sendable {
    let currency: String
    let periodStart: LocalDate?
    let periodEnd: LocalDate?
    let totalSpending: Money
    let totalIncome: Money
    let transactionCount: Int
    let expenseCount: Int
    let incomeCount: Int
    let transferCount: Int
}

struct CategorySpending: Decodable, Identifiable, Sendable {
    let categoryId: UUID?
    let category: String
    let amount: Money
    let transactionCount: Int

    var id: String { categoryId?.uuidString ?? "uncategorized" }
}

struct SpendingByCategory: Decodable, Sendable {
    let currency: String
    let periodStart: LocalDate?
    let periodEnd: LocalDate?
    let items: [CategorySpending]
}
