import { Plus, Trash2 } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import type { ExtractionRule } from '../../lib/api';
import type { FormValues } from './requestEditorModel';

type RequestSettingsTabProps = {
  ruleFields: Array<{ id: string }>;
  register: UseFormRegister<FormValues>;
  appendRule: (value: ExtractionRule) => void;
  removeRule: (index: number) => void;
  templateOptions: Array<{ id: string; name: string }>;
  selectedTemplateId: string;
  presetOptions: Array<{ id: string; label: string }>;
  selectedPresetId: string;
  onTemplateSelect: (id: string) => void;
  onApplyTemplate: () => void;
  onSaveTemplate: () => void;
  onDeleteTemplate: () => void;
  onPresetSelect: (id: string) => void;
  onApplyPreset: () => void;
};

export const RequestSettingsTab = ({
  ruleFields,
  register,
  appendRule,
  removeRule,
  templateOptions,
  selectedTemplateId,
  presetOptions,
  selectedPresetId,
  onTemplateSelect,
  onApplyTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  onPresetSelect,
  onApplyPreset,
}: RequestSettingsTabProps) => {
  return (
    <div className="bg-card h-full p-4">
      <div className="mb-6 border border-border rounded p-3 bg-muted/10">
        <h3 className="text-sm font-bold text-muted-foreground mb-2">Automation</h3>
        <p className="text-xs text-muted-foreground mb-3">Manage reusable request templates and quick presets.</p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-[11px] uppercase text-muted-foreground">Templates</div>
            <div className="flex gap-2">
              <select
                className="flex-1 bg-white border border-input rounded px-2 py-2 text-xs"
                value={selectedTemplateId}
                onChange={(e) => onTemplateSelect(e.target.value)}
              >
                <option value="">Select template...</option>
                {templateOptions.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <button
                className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
                type="button"
                onClick={onApplyTemplate}
                disabled={!selectedTemplateId}
              >
                Apply
              </button>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
                type="button"
                onClick={onSaveTemplate}
              >
                Save Current as Template
              </button>
              <button
                className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
                type="button"
                onClick={onDeleteTemplate}
                disabled={!selectedTemplateId}
              >
                Delete
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] uppercase text-muted-foreground">Presets</div>
            <div className="flex gap-2">
              <select
                className="flex-1 bg-white border border-input rounded px-2 py-2 text-xs"
                value={selectedPresetId}
                onChange={(e) => onPresetSelect(e.target.value)}
              >
                <option value="">Select preset...</option>
                {presetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <button
                className="px-3 py-2 text-xs rounded border border-border bg-white hover:bg-muted transition-colors font-medium"
                type="button"
                onClick={onApplyPreset}
                disabled={!selectedPresetId}
              >
                Apply Preset
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mb-6">
        <h3 className="text-sm font-bold text-muted-foreground mb-2">Auto-Magic Extraction</h3>
        <p className="text-xs text-muted-foreground mb-4">Automatically capture data from the JSON response and save it to the Environment.</p>

        <div className="space-y-2">
          {ruleFields.map((field, idx) => (
            <div key={field.id} className="flex gap-2 items-center bg-muted/10 p-2 rounded border border-border">
              <div className="flex-1">
                <div className="text-[10px] uppercase text-muted-foreground">Source (JMESPath)</div>
                <input className="w-full bg-transparent font-mono text-sm focus:outline-none" {...register(`extract_rules.${idx}.source_path`)} />
              </div>
              <div className="text-muted-foreground">→</div>
              <div className="flex-1">
                <div className="text-[10px] uppercase text-muted-foreground">Target Variable</div>
                <input className="w-full bg-transparent font-mono text-sm text-yellow-500 focus:outline-none" {...register(`extract_rules.${idx}.target_variable`)} />
              </div>
              <button
                onClick={() => removeRule(idx)}
                className="text-destructive hover:bg-destructive/10 p-2 rounded transition-colors"
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button
            onClick={() =>
              appendRule({
                id: `rule-${Date.now()}`,
                source_path: 'id',
                target_variable: 'extracted_value',
              })
            }
            className="w-full py-2 flex items-center justify-center gap-2 border border-dashed border-border rounded hover:bg-muted/20 text-xs text-muted-foreground"
            type="button"
          >
            <Plus size={14} /> Add Extraction Rule
          </button>
        </div>
      </div>
    </div>
  );
};
