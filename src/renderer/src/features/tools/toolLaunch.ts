import type { ExplorerPresetConfig, LooperPresetConfig } from '@/state/toolPresets'
import type { IdentifierInput } from './identifierInput'
import type { DictView } from './keyDictionary'
import type { VoiceLeadingConfig } from './voiceLeadingConfig'
import type { ReharmConfig } from './reharmonisation'

export type ToolLaunch =
  | { tab: 'explorer'; config: ExplorerPresetConfig }
  | { tab: 'looper'; config: LooperPresetConfig }
  | { tab: 'voiceLeading'; config: VoiceLeadingConfig }
  | { tab: 'reharmonisation'; config: ReharmConfig }
  | { tab: 'identifier'; input: IdentifierInput }
  | { tab: 'dictionary'; entry: DictView }
