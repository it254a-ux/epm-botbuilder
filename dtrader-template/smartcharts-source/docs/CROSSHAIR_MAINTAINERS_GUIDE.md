# Crosshair Implementation - Maintainer's Guide

## Overview

The crosshair functionality in SmartCharts provides users with precise price and time information when hovering over the chart. This guide covers the complete architecture, components, and maintenance considerations for the crosshair system.

## Architecture Overview

The crosshair implementation follows a reactive architecture using MobX for state management, with the following key components:

```
┌─────────────────────────┐
│   CrosshairToggle.tsx   │  ← UI Component
│   (React Component)     │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│   CrosshairStore.ts     │  ← State Management
│   (MobX Store)          │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  Flutter Chart Layer    │  ← Chart Rendering
│  (Native Implementation)│
└─────────────────────────┘
```

## Core Components

### 1. CrosshairStore (`src/store/CrosshairStore.ts`)

**Purpose**: Manages crosshair state with both user-controlled and temporary visibility states.

**Key Properties**:
- `isEnabled: boolean` - User's toggle preference (default: `true`)
- `isTemporarilyDisabled: boolean` - Temporary override for UI interactions
- `isFunctionallyActive: computed` - Final visibility state combining both flags

**Key Methods**:
- `updateEnabledState(enabled: boolean)` - User toggle handler
- `setTemporaryDisabled(disabled: boolean)` - Temporary visibility control

**State Logic**:
```typescript
// Final visibility = user preference AND not temporarily disabled
get isFunctionallyActive(): boolean {
    return this.isEnabled && !this.isTemporarilyDisabled;
}
```

### 2. CrosshairToggle Component (`src/components/CrosshairToggle.tsx`)

**Purpose**: Provides UI control for crosshair visibility toggle.

**Implementation Details**:
- Uses MobX `observer` for reactive updates
- Conditionally shows tooltips (disabled on mobile)
- Icon reflects current state, label shows available action
- Integrates with `Toggle` form component

**UX Pattern**:
```typescript
// Icon shows current state
const CrosshairIcon = crosshair.isEnabled ? CrosshairOnIcon : CrosshairOffIcon;

// Label shows available action  
const crosshairLabel = crosshair.isEnabled ? localize('Disable Crosshair') : localize('Enable Crosshair');
```

### 3. Integration Points

**Flutter Chart Integration**:
- Crosshair visibility updates are sent to Flutter chart via `updateCrosshairVisibility()`
- Located in `chartAdapter.flutterChart?.config.updateCrosshairVisibility()`

**Temporary Disable Triggers**:
Multiple UI components temporarily disable crosshair during interactions:
- `ToolbarWidgetStore` - On mouse enter/leave
- `NavigationWidgetStore` - During navigation interactions  
- `ChartTitleStore` - During title area hover
- `ViewStore` - During view transitions

## State Flow Diagram

```
User Toggle Action
       │
       ▼
┌─────────────────┐    updateEnabledState()    ┌─────────────────┐
│ CrosshairToggle │ ──────────────────────────▶ │ CrosshairStore  │
└─────────────────┘                            └─────────┬───────┘
                                                         │
UI Interactions                                          │
       │                                                 │
       ▼                                                 ▼
┌─────────────────┐    setTemporaryDisabled()    ┌─────────────────┐
│ Various Stores  │ ──────────────────────────▶  │ Flutter Chart   │
│ (Navigation,    │                              │ updateCrosshair │
│  Toolbar, etc.) │                              │ Visibility()    │
└─────────────────┘                              └─────────────────┘
```

## File Structure

```
src/
├── components/
│   ├── CrosshairToggle.tsx      # Main UI component
│   ├── Icons.tsx               # Crosshair icons (On/Off)
│   └── Tooltip.tsx             # Tooltip wrapper
├── store/
│   ├── CrosshairStore.ts       # Core state management
│   ├── ChartAdapterStore.ts    # Flutter integration
│   ├── NavigationWidgetStore.ts # Navigation interactions
│   ├── ToolbarWidgetStore.ts   # Toolbar interactions
│   └── ViewStore.ts           # View transitions
└── types/
    ├── props.types.ts         # Crosshair-related type definitions
    └── stores.types.ts        # Store type definitions
```

## Key Dependencies

**React Ecosystem**:
- `mobx-react-lite` - Reactive component updates
- `observer` - MobX React integration

**Internal Dependencies**:
- `Toggle` component from `./Form`
- `Tooltip` component for UX enhancement
- `useStores` hook for store access

**Flutter Integration**:
- Chart rendering handled by Flutter web
- TypeScript interfaces in `types/props.types.ts`

## Maintenance Guidelines

### 1. State Management Best Practices

**Always use the computed property**:
```typescript
// ✅ Correct - uses computed property
crosshair.isFunctionallyActive

// ❌ Incorrect - bypasses temporary disable logic  
crosshair.isEnabled
```

**Temporary disable pattern**:
```typescript
// ✅ Correct pattern for UI interactions
onMouseEnter = () => this.crosshairStore.setTemporaryDisabled(true);
onMouseLeave = () => this.crosshairStore.setTemporaryDisabled(false);
```

### 2. UI Component Guidelines

**Icon and Label Logic**:
- Icon should represent **current state**
- Label should describe **available action**
- This follows standard UI/UX conventions

**Mobile Considerations**:
- Tooltips are disabled on mobile devices
- Touch interactions may require different crosshair behavior

### 3. Testing Considerations

**Unit Tests Should Cover**:
- State transitions in `CrosshairStore`
- Computed property logic (`isFunctionallyActive`)
- Component rendering with different states
- Integration with Flutter chart updates

**Integration Tests Should Cover**:
- User toggle interactions
- Temporary disable/enable cycles
- Mobile vs desktop behavior differences

### 4. Performance Considerations

**MobX Optimization**:
- Store uses `makeObservable` for optimal reactivity
- Component wrapped with `observer` for minimal re-renders
- Computed properties cache results automatically

**Flutter Integration**:
- Chart updates are batched through the adapter layer
- Avoid frequent state changes during animations

## Common Issues & Solutions

### Issue 1: Crosshair Not Appearing
**Symptoms**: User enables crosshair but it doesn't show
**Diagnosis**: Check `isFunctionallyActive` - likely temporarily disabled
**Solution**: Verify no UI components have `setTemporaryDisabled(true)` stuck

### Issue 2: Crosshair Stuck On/Off
**Symptoms**: Toggle doesn't respond or crosshair doesn't hide
**Solution**: 
```typescript
// Reset both states
crosshair.updateEnabledState(false);
crosshair.setTemporaryDisabled(false);
```

### Issue 3: Mobile Tooltip Issues
**Symptoms**: Tooltips showing inappropriately on mobile
**Check**: `isMobile` detection in component:
```typescript
<Tooltip enabled={!isMobile} ... >
```

## Development Workflow

### Adding New Temporary Disable Triggers

1. Get crosshair store reference:
```typescript
get crosshairStore() {
    return this.mainStore.crosshair;
}
```

2. Implement mouse handlers:
```typescript
onMouseEnter = () => this.crosshairStore.setTemporaryDisabled(true);
onMouseLeave = () => this.crosshairStore.setTemporaryDisabled(false);
```

3. Ensure proper cleanup in component unmount/destroy methods

### Modifying Crosshair Behavior

1. **State Changes**: Modify `CrosshairStore.ts`
2. **UI Changes**: Update `CrosshairToggle.tsx`
3. **Chart Integration**: Update Flutter chart interface calls
4. **Add Tests**: Cover new behavior in test suites

## Future Considerations

### Potential Enhancements
- **Keyboard Shortcuts**: Add hotkey support for crosshair toggle
- **Advanced Modes**: Multiple crosshair styles/modes
- **Persistence**: Remember user preference across sessions
- **Animation**: Smooth crosshair transitions

### Migration Notes
- If moving away from Flutter: Abstract chart integration interface
- If updating MobX: Review `makeObservable` configuration
- If changing UI framework: Maintain current UX patterns

## Related Documentation

- **MobX Integration**: See store architecture patterns
- **Flutter Chart**: Consult Flutter bridge documentation  
- **UI Components**: Reference form component guidelines
- **Mobile UX**: Check mobile-specific interaction patterns

---

**Maintainers**: Chart Team
**Last Updated**: September 2025