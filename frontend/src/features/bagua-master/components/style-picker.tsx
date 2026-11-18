import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Layers } from 'lucide-react';
import { MAP_THEMES, THEME_NAMES, type MapTheme } from '../map/themes';

export function StylePicker({
  theme,
  onChange,
}: {
  theme: MapTheme;
  onChange: (theme: MapTheme) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="bm-style-trigger"
        aria-label={`Estilo del mapa: ${MAP_THEMES[theme].label}`}
      >
        <Layers size={16} aria-hidden="true" />
        <span>{MAP_THEMES[theme].label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="bm-style-menu" align="start" sideOffset={8} collisionPadding={12}>
          <Menu.Label className="bm-style-label">Apariencia del mapa</Menu.Label>
          <Menu.RadioGroup value={theme} onValueChange={(value) => onChange(value as MapTheme)}>
            {THEME_NAMES.map((name) => (
              <Menu.RadioItem className="bm-style-option" key={name} value={name}>
                <span className={`bm-style-swatch bm-swatch-${name}`} aria-hidden="true" />
                <span>{MAP_THEMES[name].label}</span>
                <Menu.ItemIndicator className="bm-style-check">
                  <Check size={16} />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <p className="bm-style-note">Overture Maps · cambia solo la apariencia</p>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
