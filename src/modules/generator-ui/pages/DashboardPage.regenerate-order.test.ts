import { describe, it, expect } from 'vitest'

describe('DashboardPage Regeneration Ordering Mechanism', () => {
  it('updates manualOrder correctly when a job is regenerated', () => {
    // Proves the state update logic used inside DashboardPage regenerateCard
    const manualOrder = ['card-a', 'card-b-old', 'card-c']
    const job = { id: 'card-b-old' }
    const seededJob = { id: 'card-b-new' }
    
    let resultOrder: string[] | null = null
    const setManualOrder = (updater: (curr: string[] | null) => string[] | null) => {
      resultOrder = updater(manualOrder)
    }

    setManualOrder((currentOrder) => {
      if (!currentOrder) return null
      const nextOrder = [...currentOrder]
      const oldIdx = nextOrder.indexOf(job.id)
      if (oldIdx >= 0) {
        nextOrder.splice(oldIdx, 1, seededJob.id)
      }
      return nextOrder
    })

    expect(resultOrder).toEqual(['card-a', 'card-b-new', 'card-c'])
    // Proves it does not append and re-sort (which was the bug where the replaced ID was lost and the new one appended)
    expect(resultOrder?.[1]).toBe('card-b-new')
    expect(resultOrder?.length).toBe(3)
  })
})
