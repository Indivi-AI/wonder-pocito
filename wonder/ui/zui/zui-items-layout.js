


component('groupByScatter', {
  type: 'items_layout',
  params: [
    {id: 'groupBy', as: 'string', description: 'property used for grouping'},
    {id: 'sort', as: 'string', description: 'property used for sorting inside group', byName: true},
    {id: 'groupGap', as: 'number', defaultValue: 1}
  ],
  impl: (ctx, groupBy, sortAtt, groupGap) => {
    const items = ctx.vars.items || []
    const minGridSize = ctx.vars.domain.minGridSize
    const groups = {}
    if (sortAtt) {
      const numericAtt = `n_${sortAtt}`
      items.forEach(item => (item[numericAtt] = +item[sortAtt]))
      items.sort((i1, i2) => i1[numericAtt] - i2[numericAtt])
    }
    items.forEach(item => {
      const groupKey = item[groupBy]
      groups[groupKey] = groups[groupKey] || []
      groups[groupKey].push(item)
    })

    const sortedGroups = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)

    const groupCenters = [], groupLayouts = {}
    let gridBounds = [[0,0],[0,0]]

    sortedGroups.forEach((groupKey, index) => {
      const groupItems = groups[groupKey]

      const itemsPerRow = Math.ceil(Math.sqrt(groupItems.length))
      const gridSize = [itemsPerRow, Math.ceil(groupItems.length / itemsPerRow)]
      const groupBoxSize = Math.max(...gridSize)
      let pos = [0,0]

      if (index === 0) {
        pos = [0,0]
      } else {
        // Place subsequent groups around existing groups
        let placed = false
        for (const [cx, cy, otherSize] of groupCenters) {
          const candidates = [
            [cx + otherSize / 2 + groupBoxSize / 2 + groupGap, cy], // Right
            [cx - otherSize / 2 - groupBoxSize / 2 - groupGap, cy], // Left
            [cx, cy + otherSize / 2 + groupBoxSize / 2 + groupGap], // Top
            [cx, cy - otherSize / 2 - groupBoxSize / 2 - groupGap]  // Bottom
          ]

          for (const [candidateX, candidateY] of candidates) {
            const noOverlap = !groupCenters.some(([ox, oy, oSize]) => {
              const distance = Math.hypot(candidateX - ox, candidateY - oy)
              const combinedSize = (groupBoxSize + oSize) / 2 + groupGap
              return distance < combinedSize
            })
            if (noOverlap) {
              pos = [candidateX, candidateY]
              placed = true; break
            }
          }
          if (placed) break
        }

        if (!placed) {
          // If no valid position is found, expand the bounds and place
          pos = [0,1].map(axis=>gridBounds[axis][1] + groupBoxSize / 2 + groupGap)
          // x = gridBounds.maxX + groupBoxSize / 2 + groupGap
          // y = gridBounds.maxY + groupBoxSize / 2 + groupGap
        }
      }

      [0,1].map(axis=>{ 
        gridBounds[axis][0] = Math.min(gridBounds[axis][0], pos[axis] - groupBoxSize / 2) 
        gridBounds[axis][1] = Math.max(gridBounds[axis][1], pos[axis] + groupBoxSize / 2) 
      })

      groupCenters.push([...pos, groupBoxSize])
      groupLayouts[groupKey] = { gridSize, center: pos }

      const center = [0,1].map(axis=>Math.floor(pos[axis] -gridSize[axis]/2))
      spiral(groupItems, center)
    })

    items.forEach(item => [0,1].map(axis=> item.xyPos[axis] -= gridBounds[axis][0])) // -= min

    const _gridSize = [0,1].map(axis => gridBounds[axis][1] - gridBounds[axis][0]) // max-min
    const gridSize = [0,1].map(axis => Math.max(_gridSize[axis], minGridSize[axis]))
    // const minCenterFix = [0,1].map(axis => _gridSize[axis] - gridSize[axis])
    // const centerOffset = [ gridBounds.minX + Math.floor(_gridSize[0] / 2), gridBounds.minY + Math.floor(_gridSize[1] / 2) ]
    // items.forEach(item => [0,1].map(axis=> item.xyPos[axis] = Math.floor(item.xyPos[axis] - centerOffset[axis])))

    const center = [0,1].map(axis => Math.floor(gridSize[axis] / 2))
    const initialZoom = Math.max(...gridSize,1)
    return { initialZoom, center, gridSize }

    function spiral(groupItems, center) {
      let x = center[0], y = center[1]
      let step = 1 // Step size
      let direction = 0 // 0 = right, 1 = down, 2 = left, 3 = up
      let stepsRemaining = 1 // Number of items to place in the current direction
  
      groupItems.forEach(item => {
          item.xyPos = [x, y]
          if (direction === 0) x++
          else if (direction === 1) y++
          else if (direction === 2) x--
          else if (direction === 3) y--
  
          stepsRemaining--
          if (stepsRemaining === 0) {
              direction = (direction + 1) % 4 // Change direction
              if (direction === 0 || direction === 2) step++ // Increase step size every two turns
              stepsRemaining = step
          }
      })
    }
  }
})
