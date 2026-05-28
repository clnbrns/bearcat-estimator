import React, { useId } from 'react';

// Shared accessible form primitives. Every field gets a unique id + explicit
// htmlFor linkage so screen readers + voice control land on the right input,
// and validation messaging is wired via aria-invalid / aria-describedby
// instead of being communicated by color alone.

/**
 * Field — labelled wrapper. Pass any input as children. The first input
 * descendant should receive {labelId} as its id and {describedById} as its
 * aria-describedby when a hint or error is shown. For the common case of a
 * single input, prefer NumField / TextField / SelectField below.
 */
export function Field({ label, hint, error, children, className = '' }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const child = React.Children.only(children);
  const enhanced = React.cloneElement(child, {
    id: child.props.id || id,
    'aria-invalid': error ? true : child.props['aria-invalid'],
    'aria-describedby': [
      child.props['aria-describedby'],
      hint && hintId,
      error && errorId,
    ].filter(Boolean).join(' ') || undefined,
  });
  return (
    <div className={className}>
      <label htmlFor={enhanced.props.id} className="text-sm font-medium text-brand-green mb-1 block">
        {label}
      </label>
      {enhanced}
      {hint && !error && (
        <div id={hintId} className="text-xs text-brand-green/60 mt-1">{hint}</div>
      )}
      {error && (
        <div id={errorId} role="status" className="text-xs text-brand-orange mt-1">
          <span aria-hidden="true">⚠ </span>{error}
        </div>
      )}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, hint, error, required, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`input ${error ? 'border-brand-orange ring-1 ring-brand-orange/40' : ''}`}
        {...rest}
      />
    </Field>
  );
}

export function NumField({ label, value, onChange, placeholder, hint, error, min = 0, step = 'any', ...rest }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input ${error ? 'border-brand-orange ring-1 ring-brand-orange/40' : ''}`}
        {...rest}
      />
    </Field>
  );
}

/**
 * NumFieldRanged — NumField with warn-above / warn-below thresholds. The
 * warning surfaces both visually (border) AND via aria-invalid + a status
 * region the screen reader will announce.
 */
export function NumFieldRanged({ label, value, onChange, placeholder, warnAbove, warnAboveMsg, warnBelow, warnBelowMsg, hint }) {
  const num = Number(value);
  const aboveWarn = warnAbove && num > 0 && num > warnAbove;
  const belowWarn = warnBelow && num > 0 && num < warnBelow;
  const warning = aboveWarn ? warnAboveMsg : belowWarn ? warnBelowMsg : null;
  return <NumField label={label} value={value} onChange={onChange} placeholder={placeholder} hint={hint} error={warning} />;
}

export function SelectField({ label, value, onChange, options, hint, error, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className={`input ${error ? 'border-brand-orange ring-1 ring-brand-orange/40' : ''}`}
        {...rest}
      >
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
    </Field>
  );
}

export function Check({ checked, onChange, label, hint }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        onChange={onChange}
        aria-describedby={hint ? hintId : undefined}
        className="accent-brand-orange w-4 h-4"
      />
      <span>{label}</span>
      {hint && <span id={hintId} className="text-xs text-brand-green/60 ml-1">{hint}</span>}
    </label>
  );
}
