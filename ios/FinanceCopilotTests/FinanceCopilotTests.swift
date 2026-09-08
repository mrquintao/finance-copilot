import Foundation
import XCTest
@testable import FinanceCopilot

final class FinanceCopilotTests: XCTestCase {
    private func decode<T: Decodable>(_ name: String) throws -> T {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json"))
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: Data(contentsOf: url))
    }

    func testBackendTransactionContract() throws {
        let transaction: Transaction = try decode("transaction")
        XCTAssertEqual(transaction.amount.value, Decimal(string: "39.90"))
        XCTAssertEqual(transaction.amount.minorUnits, 3990)
        XCTAssertEqual(transaction.type, .debit)
        XCTAssertEqual(transaction.merchant, "Netflix")
        XCTAssertEqual(transaction.date.rawValue, "2026-09-05")
        XCTAssertEqual(transaction.category?.name, "Assinaturas")
        XCTAssertEqual(transaction.accountId, transaction.account.id)
    }

    func testBackendAnalyticsContracts() throws {
        let summary: SpendingSummary = try decode("summary")
        let categories: SpendingByCategory = try decode("categories")
        XCTAssertEqual(summary.totalSpending.value, Decimal(string: "3649.94"))
        XCTAssertEqual(summary.totalIncome.value, Decimal(string: "8150.00"))
        XCTAssertEqual(summary.transactionCount, 21)
        XCTAssertEqual(categories.items.reduce(Decimal.zero) { $0 + $1.amount.value },
                       summary.totalSpending.value)
        XCTAssertTrue(categories.items.contains { $0.categoryId == nil })
    }

    func testDecimalStringsAndChartLimits() throws {
        let decoder = JSONDecoder()
        let tiny = try decoder.decode(Money.self, from: Data(#""0.30""#.utf8))
        XCTAssertEqual(tiny.minorUnits, 30)
        let large = try decoder.decode(Money.self, from: Data(#""9999999999999999.99""#.utf8))
        XCTAssertEqual(large.value, Decimal(string: "9999999999999999.99"))
        XCTAssertEqual(large.minorUnits, 999999999999999999)
        let overflow = try decoder.decode(Money.self, from: Data(#""999999999999999999.99""#.utf8))
        XCTAssertNil(overflow.minorUnits)
        for invalid in ["0.30", #""0.001""#, #""NaN""#, #""-1.00""#] {
            XCTAssertThrowsError(try decoder.decode(Money.self, from: Data(invalid.utf8)))
        }
    }

    func testCalendarDaysAndInvalidPeriod() throws {
        let leapDay = try LocalDate(rawValue: "2024-02-29")
        XCTAssertEqual(LocalDate(date: leapDay.date), leapDay)
        XCTAssertEqual(leapDay.display, "29/02/2024")
        XCTAssertThrowsError(try LocalDate(rawValue: "2026-02-30"))
        XCTAssertThrowsError(try LocalDate(rawValue: "2026-2-01"))
        let reversed = Period(start: Period.demo.end, end: Period.demo.start)
        XCTAssertFalse(reversed.isValid)
        XCTAssertEqual(Period.demo.queryItems.first?.value, "2026-09-01")
    }

    func testBackendURLRejectsEmbeddedCredentials() throws {
        let url = try XCTUnwrap(URL(string: "https://user:secret@localhost:8000"))
        XCTAssertThrowsError(try APIClient(baseURL: url))
    }
}
