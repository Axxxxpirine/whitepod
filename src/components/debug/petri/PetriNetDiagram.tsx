import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react'
import * as dagre from 'dagre'
import type { Transition } from '@/core/types'

type Point = { x: number; y: number }

type DiagramNode =
  | { kind: 'place'; id: string; x: number; y: number }
  | { kind: 'transition'; id: string; x: number; y: number }

type DiagramEdge = {
  from: { kind: 'place' | 'transition'; id: string }
  to: { kind: 'place' | 'transition'; id: string }
  weight: number
  points: Point[]
}

function clipPoint(node: DiagramNode, target: Point): Point {
  const dx = target.x - node.x
  const dy = target.y - node.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return { x: node.x, y: node.y }

  if (node.kind === 'place') {
    const r = 18
    const scale = r / dist
    return { x: node.x + dx * scale, y: node.y + dy * scale }
  }

  // transition rect
  const halfWidth = 28
  const halfHeight = 14
  const scaleX = halfWidth / Math.abs(dx || 1e-9)
  const scaleY = halfHeight / Math.abs(dy || 1e-9)
  const scale = Math.min(scaleX, scaleY)
  return { x: node.x + dx * scale, y: node.y + dy * scale }
}

function placeId(place: string): string {
  return `p:${place}`
}

function transitionId(id: string): string {
  return `t:${id}`
}

function decodeNodeId(nodeId: string): { kind: 'place' | 'transition'; id: string } {
  if (nodeId.startsWith('p:')) return { kind: 'place', id: nodeId.slice(2) }
  if (nodeId.startsWith('t:')) return { kind: 'transition', id: nodeId.slice(2) }
  throw new Error(`Unknown node id '${nodeId}'`)
}

export interface PetriNetDiagramProps {
  transitions: Transition[]
  marking: Record<string, number>
  enabledTransitionIds: ReadonlySet<string>
  onFireTransition: (transitionId: string) => void
  visibleTransitionIds?: ReadonlySet<string>
  visiblePlaceIds?: ReadonlySet<string>
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampPan(pan: Point, zoom: number, bounds: { x: number; y: number; width: number; height: number }): Point {
  const viewW = bounds.width / zoom
  const viewH = bounds.height / zoom
  const maxX = bounds.x + Math.max(0, bounds.width - viewW)
  const maxY = bounds.y + Math.max(0, bounds.height - viewH)

  return {
    x: clamp(pan.x, bounds.x, maxX),
    y: clamp(pan.y, bounds.y, maxY),
  }
}

export function PetriNetDiagram({
  transitions,
  marking,
  enabledTransitionIds,
  onFireTransition,
  visibleTransitionIds,
  visiblePlaceIds,
}: PetriNetDiagramProps) {
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })

  const dragRef = useRef<null | { start: Point; pan: Point }>(null)
  const minimapRef = useRef<SVGSVGElement | null>(null)
  const roiDragRef = useRef<null | { start: Point; pan: Point }>(null)
  const minimapDragRef = useRef<null | { start: Point; pos: Point }>(null)

  const [minimapPos, setMinimapPos] = useState<Point>({ x: 12, y: 12 })

  const layout = useMemo(() => {
    const places = new Set<string>()
    for (const t of transitions) {
      for (const input of t.consumes) places.add(input.place)
      for (const output of t.produces) places.add(output.place)
    }

    const g = new dagre.graphlib.Graph()
    g.setGraph({
      rankdir: 'LR',
      marginx: 24,
      marginy: 24,
      nodesep: 24,
      ranksep: 54,
    })
    g.setDefaultEdgeLabel(() => ({}))

    for (const p of places) {
      g.setNode(placeId(p), { width: 36, height: 36 })
    }

    for (const t of transitions) {
      g.setNode(transitionId(t.id), { width: 56, height: 28 })
    }

    for (const t of transitions) {
      for (const input of t.consumes) {
        g.setEdge(placeId(input.place), transitionId(t.id), { weight: input.qty })
      }
      for (const output of t.produces) {
        g.setEdge(transitionId(t.id), placeId(output.place), { weight: output.qty })
      }
    }

    dagre.layout(g)

    const nodes: DiagramNode[] = []
    for (const nodeId of g.nodes()) {
      const pos = g.node(nodeId) as { x: number; y: number }
      const decoded = decodeNodeId(nodeId)
      nodes.push({ kind: decoded.kind, id: decoded.id, x: pos.x, y: pos.y } as DiagramNode)
    }

    const nodeByKey = new Map<string, DiagramNode>()
    for (const n of nodes) {
      nodeByKey.set(`${n.kind}:${n.id}`, n)
    }

    const edges: DiagramEdge[] = []
    for (const e of g.edges()) {
      const edge = g.edge(e) as { weight?: number; points?: Point[] }
      const fromDecoded = decodeNodeId(e.v)
      const toDecoded = decodeNodeId(e.w)
      const points = (edge.points ?? []) as Point[]

      edges.push({
        from: fromDecoded,
        to: toDecoded,
        weight: edge.weight ?? 1,
        points,
      })
    }

    const width = (g.graph() as { width: number }).width + 48
    const height = (g.graph() as { height: number }).height + 48

    return { nodes, edges, nodeByKey, bounds: { x: 0, y: 0, width, height } }
  }, [transitions])

  const isPlaceVisible = useCallback(
    (place: string) => {
      if (!visiblePlaceIds) return true
      return visiblePlaceIds.has(place)
    },
    [visiblePlaceIds],
  )

  const isTransitionVisible = useCallback(
    (transitionId: string) => {
      if (!visibleTransitionIds) return true
      return visibleTransitionIds.has(transitionId)
    },
    [visibleTransitionIds],
  )

  const viewBox = useMemo(() => {
    const w = layout.bounds.width / zoom
    const h = layout.bounds.height / zoom
    return `${pan.x} ${pan.y} ${w} ${h}`
  }, [layout.bounds.height, layout.bounds.width, pan.x, pan.y, zoom])

  const beginDrag = useCallback((e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      start: { x: e.clientX, y: e.clientY },
      pan: { ...pan },
    }
  }, [pan])

  const onDrag = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.start.x
      const dy = e.clientY - drag.start.y
      setPan(clampPan({ x: drag.pan.x - dx / zoom, y: drag.pan.y - dy / zoom }, zoom, layout.bounds))
    },
    [layout.bounds, zoom],
  )

  const endDrag = useCallback((e: PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan(clampPan({ x: 0, y: 0 }, 1, layout.bounds))
  }, [layout.bounds])

  const setZoomClamped = useCallback(
    (nextZoom: number) => {
      const z = clamp(nextZoom, 0.2, 6)
      setZoom(z)
      setPan(prev => clampPan(prev, z, layout.bounds))
    },
    [layout.bounds],
  )

  const beginRoiDrag = useCallback((e: PointerEvent<SVGRectElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    roiDragRef.current = {
      start: { x: e.clientX, y: e.clientY },
      pan: { ...pan },
    }
  }, [pan])

  const onRoiDrag = useCallback(
    (e: PointerEvent<SVGRectElement>) => {
      const drag = roiDragRef.current
      const minimap = minimapRef.current
      if (!drag || !minimap) return

      const rect = minimap.getBoundingClientRect()
      const factorX = layout.bounds.width / rect.width
      const factorY = layout.bounds.height / rect.height

      const dx = e.clientX - drag.start.x
      const dy = e.clientY - drag.start.y

      setPan(clampPan({ x: drag.pan.x + dx * factorX, y: drag.pan.y + dy * factorY }, zoom, layout.bounds))
    },
    [layout.bounds, zoom],
  )

  const endRoiDrag = useCallback((e: PointerEvent<SVGRectElement>) => {
    if (!roiDragRef.current) return
    roiDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  const beginMinimapDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.dataset.roi === '1' || target.dataset.zoom === '1') return

    e.currentTarget.setPointerCapture(e.pointerId)
    minimapDragRef.current = {
      start: { x: e.clientX, y: e.clientY },
      pos: { ...minimapPos },
    }
  }, [minimapPos])

  const onMinimapDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = minimapDragRef.current
    if (!drag) return

    const dx = e.clientX - drag.start.x
    const dy = e.clientY - drag.start.y

    setMinimapPos({ x: Math.max(0, drag.pos.x + dx), y: Math.max(0, drag.pos.y + dy) })
  }, [])

  const endMinimapDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!minimapDragRef.current) return
    minimapDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span>Zoom</span>
          <input
            type="range"
            min={0.2}
            max={4}
            step={0.05}
            value={zoom}
            onChange={e => setZoomClamped(Number.parseFloat(e.target.value))}
          />
          <code>{zoom.toFixed(2)}x</code>
        </label>
        <button className="border rounded px-2 py-1" onClick={resetView}>
          Reset view
        </button>
        <span className="text-gray-600">Drag diagram to pan</span>
      </div>

      <div className="relative">
        <svg
          className="border rounded bg-white w-full"
          style={{ height: 650 }}
          viewBox={viewBox}
          onPointerDown={beginDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
        <defs>
          <marker
            id="arrow"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L9,3 L0,6 Z" fill="#111" />
          </marker>
        </defs>

        {/* Edges */}
        {layout.edges.map((edge, idx) => {
          const fromNode = layout.nodeByKey.get(`${edge.from.kind}:${edge.from.id}`)
          const toNode = layout.nodeByKey.get(`${edge.to.kind}:${edge.to.id}`)
          if (!fromNode || !toNode) return null

          if (edge.from.kind === 'place' && !isPlaceVisible(edge.from.id)) return null
          if (edge.from.kind === 'transition' && !isTransitionVisible(edge.from.id)) return null
          if (edge.to.kind === 'place' && !isPlaceVisible(edge.to.id)) return null
          if (edge.to.kind === 'transition' && !isTransitionVisible(edge.to.id)) return null

          const rawStart = { x: fromNode.x, y: fromNode.y }
          const rawEnd = { x: toNode.x, y: toNode.y }

          const start = clipPoint(fromNode, rawEnd)
          const end = clipPoint(toNode, rawStart)

          const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

          return (
            <g key={idx}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#111" strokeWidth={1.2} markerEnd="url(#arrow)" />
              {edge.weight > 1 ? (
                <text x={mid.x} y={mid.y} fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill="#333">
                  {edge.weight}
                </text>
              ) : null}
            </g>
          )
        })}

        {/* Nodes */}
        {layout.nodes.map(node => {
          if (node.kind === 'place') {
            if (!isPlaceVisible(node.id)) return null

            const tokens = marking[node.id] ?? 0
            return (
              <g key={`p:${node.id}`}>
                <circle cx={node.x} cy={node.y} r={18} fill="#fff" stroke="#111" strokeWidth={1.4} />
                <text x={node.x} y={node.y} fontSize={11} textAnchor="middle" dominantBaseline="middle">
                  {tokens}
                </text>
                <text x={node.x} y={node.y + 30} fontSize={10} textAnchor="middle" fill="#333">
                  {node.id}
                </text>
              </g>
            )
          }

          if (!isTransitionVisible(node.id)) return null

          const isEnabled = enabledTransitionIds.has(node.id)
          const fill = isEnabled ? '#b6f7b6' : '#d0d0d0'
          const cursor = isEnabled ? 'pointer' : 'not-allowed'

          return (
            <g key={`t:${node.id}`} style={{ cursor }}>
              <rect
                x={node.x - 28}
                y={node.y - 14}
                width={56}
                height={28}
                rx={2}
                ry={2}
                fill={fill}
                stroke="#111"
                strokeWidth={1.2}
                onClick={() => {
                  if (!isEnabled) return
                  onFireTransition(node.id)
                }}
              />
              <text x={node.x} y={node.y + 4} fontSize={10} textAnchor="middle" fill="#111">
                {node.id}
              </text>
            </g>
          )
        })}
        </svg>

        {/* Draggable minimap */}
        <div
          className="absolute bg-white/95 border rounded shadow-sm p-2"
          style={{ left: minimapPos.x, top: minimapPos.y, width: 260 }}
          onPointerDown={beginMinimapDrag}
          onPointerMove={onMinimapDrag}
          onPointerUp={endMinimapDrag}
          onPointerCancel={endMinimapDrag}
        >
          <div className="text-xs text-gray-700 mb-1 select-none">Minimap (drag to move)</div>

          <svg
            ref={minimapRef}
            className="w-full border rounded bg-gray-50"
            style={{ height: 160 }}
            viewBox={`${layout.bounds.x} ${layout.bounds.y} ${layout.bounds.width} ${layout.bounds.height}`}
            preserveAspectRatio="none"
          >
            {/* Edges */}
            {layout.edges.map((edge, idx) => {
              const fromNode = layout.nodeByKey.get(`${edge.from.kind}:${edge.from.id}`)
              const toNode = layout.nodeByKey.get(`${edge.to.kind}:${edge.to.id}`)
              if (!fromNode || !toNode) return null

              if (edge.from.kind === 'place' && !isPlaceVisible(edge.from.id)) return null
              if (edge.from.kind === 'transition' && !isTransitionVisible(edge.from.id)) return null
              if (edge.to.kind === 'place' && !isPlaceVisible(edge.to.id)) return null
              if (edge.to.kind === 'transition' && !isTransitionVisible(edge.to.id)) return null

              const rawStart = { x: fromNode.x, y: fromNode.y }
              const rawEnd = { x: toNode.x, y: toNode.y }

              const start = clipPoint(fromNode, rawEnd)
              const end = clipPoint(toNode, rawStart)

              return (
                <line
                  key={idx}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="#444"
                  strokeWidth={1}
                />
              )
            })}

            {/* Nodes */}
            {layout.nodes.map(node => {
              if (node.kind === 'place') {
                if (!isPlaceVisible(node.id)) return null
                return <circle key={`mm:p:${node.id}`} cx={node.x} cy={node.y} r={8} fill="#fff" stroke="#444" strokeWidth={1} />
              }

              if (!isTransitionVisible(node.id)) return null

              const isEnabled = enabledTransitionIds.has(node.id)
              return (
                <rect
                  key={`mm:t:${node.id}`}
                  x={node.x - 10}
                  y={node.y - 6}
                  width={20}
                  height={12}
                  fill={isEnabled ? '#b6f7b6' : '#d0d0d0'}
                  stroke="#444"
                  strokeWidth={1}
                />
              )
            })}

            {/* ROI */}
            <rect
              data-roi="1"
              x={pan.x}
              y={pan.y}
              width={layout.bounds.width / zoom}
              height={layout.bounds.height / zoom}
              fill="none"
              stroke="#e11d48"
              strokeWidth={2}
              style={{ cursor: 'move', pointerEvents: 'all' }}
              onPointerDown={beginRoiDrag}
              onPointerMove={onRoiDrag}
              onPointerUp={endRoiDrag}
              onPointerCancel={endRoiDrag}
            />
          </svg>

          <div className="text-xs mt-2 flex items-center gap-2">
            <span>Zoom</span>
            <input
              data-zoom="1"
              type="range"
              min={0.2}
              max={4}
              step={0.05}
              value={zoom}
              onChange={e => setZoomClamped(Number.parseFloat(e.target.value))}
              className="flex-1"
            />
            <code className="text-[10px]">{zoom.toFixed(2)}x</code>
          </div>
        </div>
      </div>
    </div>
  )
}
