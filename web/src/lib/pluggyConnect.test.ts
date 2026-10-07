import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPluggyConnect } from './pluggyConnect'

interface WidgetProps {
  connectToken: string
  connectorIds?: number[]
  selectedConnectorId?: number
  includeSandbox?: boolean
  onSuccess: (data: { item: { id?: string } }) => void
  onError: (error: { message: string }) => void
  onClose: () => void
}

const widgets: WidgetProps[] = []

vi.mock('pluggy-connect-sdk', () => ({
  PluggyConnect: class {
    constructor(props: WidgetProps) {
      widgets.push(props)
    }
    init() {
      return Promise.resolve()
    }
  },
}))

async function open() {
  const result = openPluggyConnect('tok')
  await vi.waitFor(() => expect(widgets).toHaveLength(1))
  return { result, props: widgets[0]! }
}

describe('openPluggyConnect', () => {
  beforeEach(() => {
    widgets.length = 0
  })

  it('offers only the MeuPluggy connector and opens directly on it', async () => {
    const { props } = await open()

    expect(props.connectToken).toBe('tok')
    expect(props.connectorIds).toEqual([200])
    expect(props.selectedConnectorId).toBe(200)
    expect(props.includeSandbox).toBeUndefined()
  })

  it('resolves with the item id on success', async () => {
    const { result, props } = await open()
    props.onSuccess({ item: { id: 'item-1' } })

    await expect(result).resolves.toBe('item-1')
  })

  it('resolves with null when the widget is closed without connecting', async () => {
    const { result, props } = await open()
    props.onClose()

    await expect(result).resolves.toBeNull()
  })

  it('rejects when the widget is closed after a connection error', async () => {
    const { result, props } = await open()
    props.onError({ message: 'login failed' })
    props.onClose()

    await expect(result).rejects.toThrow('Pluggy Connect failed')
  })

  it('still succeeds when the user retries inside the widget after an error', async () => {
    const { result, props } = await open()
    props.onError({ message: 'login failed' })
    props.onSuccess({ item: { id: 'item-2' } })
    props.onClose()

    await expect(result).resolves.toBe('item-2')
  })
})
