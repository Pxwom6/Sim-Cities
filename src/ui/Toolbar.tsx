import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { BUILDABLE_ROADS, ROAD_TYPES, type RoadTypeId } from '../data/roads';
import type { ZoneLetter } from '../data/zones';
import type { RoadMode } from '../tools/roadTool';
import type { ToolId } from '../tools/manager';
import { useGameUpdates } from './hooks';
import {
  IconBulldozer,
  IconCurve,
  IconEraser,
  IconFactory,
  IconFreeform,
  IconGrid,
  IconHouse,
  IconLock,
  IconPointer,
  IconRoad,
  IconShop,
  IconStraight,
  IconUndo,
  IconZone,
} from './icons';

interface TipContent {
  title: string;
  lines?: string[];
  key?: string;
}

function Tip({ tip, children }: { tip: TipContent; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <span class="tip-anchor" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span class="tip" role="tooltip">
          <strong>{tip.title}</strong>
          {tip.key && <kbd>{tip.key}</kbd>}
          {tip.lines?.map((l) => (
            <span class="tip-line" key={l}>
              {l}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function ToolButton(props: {
  id: string;
  active: boolean;
  onClick: () => void;
  tip: TipContent;
  children: ComponentChildren;
  disabled?: boolean;
  class?: string;
}) {
  return (
    <Tip tip={props.tip}>
      <button
        class={`tool-btn ${props.active ? 'active' : ''} ${props.class ?? ''}`}
        data-testid={props.id}
        aria-label={props.tip.title}
        aria-pressed={props.active}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    </Tip>
  );
}

const ROAD_ICON_COLOURS: Record<RoadTypeId, string> = {
  dirt: '#b59a6d',
  street: '#6b7079',
  avenue: '#4d5259',
  boulevard: '#3a3f46',
  highway: '#333',
};
const ZONES: {
  z: ZoneLetter | 'none';
  name: string;
  Icon: typeof IconHouse;
  key: string;
  cls: string;
  effect: string;
}[] = [
  {
    z: 'R',
    name: 'Residential',
    Icon: IconHouse,
    key: 'Z',
    cls: 'zone-r',
    effect: 'Homes. Residents want jobs, shops and services.',
  },
  {
    z: 'C',
    name: 'Commercial',
    Icon: IconShop,
    key: 'X',
    cls: 'zone-c',
    effect: 'Shops and offices. Need customers, workers and goods.',
  },
  {
    z: 'I',
    name: 'Industrial',
    Icon: IconFactory,
    key: 'C',
    cls: 'zone-i',
    effect: 'Factories. Need workers and a way to ship freight.',
  },
  {
    z: 'none',
    name: 'Dezone',
    Icon: IconEraser,
    key: 'V',
    cls: '',
    effect: 'Remove zoning from empty cells.',
  },
];

export function Toolbar() {
  const game = useGameUpdates(100);
  const tools = game.tools;
  const active: ToolId = tools.activeId;
  const pop = game.world.stats.population;
  const use = (id: ToolId) => tools.use(active === id && id !== 'select' ? 'select' : id);
  return (
    <div class="toolbar-wrap">
      {active === 'road' && (
        <div class="subbar panel" data-testid="road-options">
          {BUILDABLE_ROADS.map((id) => {
            const rt = ROAD_TYPES[id];
            const locked = pop < rt.unlockPopulation;
            return (
              <ToolButton
                key={id}
                id={`road-${id}`}
                active={tools.road.type === id}
                disabled={locked}
                onClick={() => tools.road.setType(id)}
                tip={{
                  title: rt.name,
                  lines: [
                    `$${rt.costPerMetre}/m to build · $${(rt.upkeepPerMetre * 100).toFixed(0)}/100 m monthly upkeep`,
                    `${rt.lanes} lanes · ${rt.speed} km/h · ${rt.capacity.toLocaleString('en-US')} vehicles/h`,
                    `Density up to ${['low', 'medium', 'high'][rt.maxDensity]}`,
                    rt.blurb,
                    ...(locked
                      ? [`Unlocks at ${rt.unlockPopulation.toLocaleString('en-US')} residents`]
                      : []),
                  ],
                }}
              >
                {locked ? (
                  <IconLock />
                ) : (
                  <span class="road-swatch" style={{ background: ROAD_ICON_COLOURS[id] }} />
                )}
                <span class="tool-label">{rt.name.replace(' road', '')}</span>
              </ToolButton>
            );
          })}
          <span class="sep" />
          {(
            [
              [
                'straight',
                IconStraight,
                'Straight',
                'Drag, or click start and end. Keeps drawing from the last end.',
              ],
              ['curve', IconCurve, 'Curve', 'Click the start, the bend, then the end.'],
              ['free', IconFreeform, 'Free-form', 'Press and draw any shape.'],
            ] as [RoadMode, typeof IconCurve, string, string][]
          ).map(([m, Icon, name, how]) => (
            <ToolButton
              key={m}
              id={`mode-${m}`}
              active={tools.road.mode === m}
              onClick={() => tools.road.setMode(m)}
              tip={{ title: name, lines: [how], key: 'Tab' }}
            >
              <Icon />
            </ToolButton>
          ))}
          <ToolButton
            id="grid-snap"
            active={tools.road.grid}
            onClick={() => {
              tools.road.grid = !tools.road.grid;
              game.notify();
            }}
            tip={{ title: 'Grid snap', lines: ['Snap to an 8 m grid and 8 m lengths.'], key: 'G' }}
          >
            <IconGrid />
          </ToolButton>
        </div>
      )}
      {active === 'zone' && (
        <div class="subbar panel" data-testid="zone-options">
          {ZONES.map(({ z, name, Icon, key, cls, effect }) => (
            <ToolButton
              key={z}
              id={`zone-${z}`}
              class={cls}
              active={tools.zone.zone === z}
              onClick={() => tools.zone.setZone(z)}
              tip={{
                title: name,
                lines: [effect, 'Zoning is free. Shift-click a road to fill both sides.'],
                key,
              }}
            >
              <Icon />
              <span class="tool-label">{name}</span>
            </ToolButton>
          ))}
          <span class="sep" />
          <label class="brush">
            Brush
            <input
              type="range"
              min={8}
              max={96}
              step={8}
              value={tools.zone.radius}
              onInput={(e) => {
                tools.zone.radius = Number((e.target as HTMLInputElement).value);
                game.notify();
              }}
            />
            <span>{tools.zone.radius} m</span>
          </label>
        </div>
      )}
      <div class="toolbar panel" data-testid="toolbar">
        <ToolButton
          id="tool-select"
          active={active === 'select'}
          onClick={() => use('select')}
          tip={{ title: 'Select', lines: ['Drag to pan. Click things to inspect them.'], key: 'H / Esc' }}
        >
          <IconPointer />
        </ToolButton>
        <ToolButton
          id="tool-road"
          active={active === 'road'}
          onClick={() => use('road')}
          tip={{
            title: 'Roads',
            lines: ['Build roads off the highway. Buildings grow along them.'],
            key: 'T',
          }}
        >
          <IconRoad />
        </ToolButton>
        <ToolButton
          id="tool-zone"
          active={active === 'zone'}
          onClick={() => use('zone')}
          tip={{
            title: 'Zoning',
            lines: ['Paint residential, commercial and industrial zones.'],
            key: 'Z X C V',
          }}
        >
          <IconZone />
        </ToolButton>
        <ToolButton
          id="tool-bulldoze"
          active={active === 'bulldoze'}
          onClick={() => use('bulldoze')}
          tip={{ title: 'Bulldoze', lines: ['Demolish roads and buildings. Roads refund 25%.'], key: 'B' }}
        >
          <IconBulldozer />
        </ToolButton>
        <span class="sep" />
        <ToolButton
          id="tool-undo"
          active={false}
          disabled={!game.world.stats.undoAvailable}
          onClick={() => void game.undo()}
          tip={{
            title: 'Undo',
            lines: ['Reverse the most recent placement, with a full refund.'],
            key: 'Ctrl+Z',
          }}
        >
          <IconUndo />
        </ToolButton>
      </div>
    </div>
  );
}

export function ToolHintLabel() {
  const game = useGameUpdates(30);
  const h = game.hint;
  if (!h) return null;
  return (
    <div
      class={`tool-hint ${h.tone}`}
      style={{ left: `${h.x + 18}px`, top: `${h.y + 18}px` }}
      data-testid="tool-hint"
    >
      {h.text}
    </div>
  );
}
