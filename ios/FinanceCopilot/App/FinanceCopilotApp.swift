import SwiftUI

@main
struct FinanceCopilotApp: App {
    private let configuration = Result { try APIClient.configured() }

    var body: some Scene {
        WindowGroup {
            switch configuration {
            case .success(let client):
                RootView(service: FinanceService(client: client))
                    .environment(\.locale, Locale(identifier: "pt_BR"))
            case .failure:
                VStack(spacing: 16) {
                    Image(systemName: "gearshape").font(.largeTitle)
                    Text("Configure o backend").font(.title2)
                    Text("Defina API_BASE_URL em Config/Local.xcconfig e execute o aplicativo novamente.")
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
        }
    }
}

private struct RootView: View {
    let service: FinanceService
    @State private var period = Period.demo

    var body: some View {
        TabView {
            DashboardView(service: service, period: $period)
                .tabItem { Label("Resumo", systemImage: "chart.bar.xaxis") }
            TransactionsView(service: service, period: $period)
                .tabItem { Label("Transações", systemImage: "list.bullet.rectangle") }
        }
        .tint(.teal)
    }
}
