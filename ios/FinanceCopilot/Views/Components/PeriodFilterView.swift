import SwiftUI

struct PeriodFilterView: View {
    @Binding var period: Period
    @State private var isEditing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Período").font(.caption).foregroundStyle(.secondary)
                    Text(period.label).font(.subheadline.weight(.medium))
                }
                Spacer()
                Button("Alterar") { isEditing = true }
            }
            Text("Dados fictícios • abr–set 2026")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding()
        .sheet(isPresented: $isEditing) {
            PeriodEditor(period: $period)
        }
    }
}

private struct PeriodEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var period: Period
    @State private var start: Date
    @State private var end: Date

    init(period: Binding<Period>) {
        _period = period
        _start = State(initialValue: period.wrappedValue.start.date)
        _end = State(initialValue: period.wrappedValue.end.date)
    }

    private var selection: Period {
        Period(start: LocalDate(date: start), end: LocalDate(date: end))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Datas inclusivas") {
                    DatePicker("De", selection: $start, displayedComponents: .date)
                    DatePicker("Até", selection: $end, displayedComponents: .date)
                    if !selection.isValid {
                        Text("A data inicial deve ser anterior à data final.")
                            .foregroundStyle(.red)
                    }
                }
                Section("Atalhos") {
                    Button("Setembro 2026 (exemplo)") { select(.demo) }
                    Button("Todos os dados de exemplo") { select(.allDemo) }
                    Button("Mês atual") { select(.currentMonth) }
                }
            }
            .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
            .environment(\.calendar, Calendar(identifier: .gregorian))
            .navigationTitle("Selecionar período")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aplicar") {
                        period = selection
                        dismiss()
                    }
                    .disabled(!selection.isValid)
                }
            }
        }
    }

    private func select(_ value: Period) {
        start = value.start.date
        end = value.end.date
    }
}
