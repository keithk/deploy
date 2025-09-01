# Action System Type Safety Migration Guide

This guide outlines the migration path from the current loosely-typed action system to the enhanced type-safe action system.

## Overview

The enhanced action system provides:
- **Complete type safety** from definition through execution
- **Runtime validation** that matches TypeScript types
- **Better error handling** with structured error types
- **Improved developer experience** with better IntelliSense and compile-time checks
- **Enhanced monitoring** with execution statistics and correlation tracking

## Migration Steps

### Phase 1: Core Type System (High Priority)

1. **Replace core action interfaces**
   ```typescript
   // Before (src/core/types/action.ts)
   handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
   
   // After (src/core/types/action-enhanced.ts)
   handler: ActionHandler<TPayload, TContext, TResult>;
   ```

2. **Update action definition functions**
   ```typescript
   // Before
   export function defineAction(options: DefineActionOptions): Action
   
   // After  
   export function defineAction<TPayload, TContext, TResult>(
     options: DefineActionOptions<TPayload, TContext, TResult>
   ): Action<TPayload, TContext, TResult>
   ```

3. **Enhanced action registry**
   - Replace `ActionRegistry` with `EnhancedActionRegistry`
   - Add execution monitoring and statistics
   - Implement retry logic with exponential backoff

### Phase 2: Existing Action Migration (Medium Priority)

1. **Update GitHub webhook handler**
   ```typescript
   // Before: Basic handler with any types
   // After: Strongly typed with validation
   createEnhancedGitHubAction({
     repository: "your-repo",
     branch: "main",
     secret: process.env.GITHUB_SECRET,
     autoRestart: true,
     buildTimeout: 300000,
   })
   ```

2. **Update scheduled actions**
   ```typescript
   // Before
   export default defineScheduledAction({
     id: "build-action",
     schedule: "0 * * * *",
     handler: async (payload: any, context) => { /* ... */ }
   });
   
   // After  
   export default defineScheduledAction<BuildPayload, BuildResult>({
     id: "build-action", 
     schedule: "0 * * * *",
     validate: buildPayloadValidator,
     retryPolicy: { maxAttempts: 3, delay: 5000, backoffMultiplier: 2 },
     handler: async (payload, context) => { /* fully typed */ }
   });
   ```

### Phase 3: Process Management Integration (Medium Priority)

1. **Enhanced process manager types**
   - Replace loose process interfaces with strongly typed versions
   - Add type-safe process action handlers
   - Implement comprehensive process result types

2. **Type-safe WebSocket updates**
   ```typescript
   // Add typed WebSocket message interfaces
   interface ProcessUpdateMessage {
     readonly type: "process_update";
     readonly payload: ProcessStatusResult;
   }
   ```

### Phase 4: Runtime Validation (High Priority)

1. **Implement payload validators**
   ```typescript
   // Create validators for each action type
   const buildActionValidator = createValidator<BuildActionPayload>({
     type: Validators.string,
     buildTarget: Validators.optional(v => v === "all" || v === "changed"),
     notify: Validators.optional(Validators.boolean),
   });
   ```

2. **Add comprehensive error handling**
   ```typescript
   // Structured error types with retry policies
   return ActionResults.error(
     "BUILD_FAILED",
     "Site build failed", 
     { site: "example", duration: 5000 },
     true // retryable
   );
   ```

## Key Benefits After Migration

### 1. Compile-Time Safety
```typescript
// Before: Runtime error potential
const result = await actionRegistry.execute("build", { typo: "value" }, context);

// After: Compile-time type checking
const result = await actionRegistry.execute<BuildPayload, BuildResult>(
  "build", 
  { buildTarget: "all" }, // Type-checked!
  context
);
```

### 2. Better Error Messages
```typescript
// Before: Generic error
{ success: false, message: "Something went wrong" }

// After: Structured error with context
{
  success: false,
  message: "Build failed for site 'example'",
  error: {
    code: "BUILD_COMMAND_FAILED",
    retryable: true,
    details: { site: "example", command: "npm run build", exitCode: 1 }
  },
  correlationId: "12345-abcde"
}
```

### 3. Enhanced Developer Experience
```typescript
// IntelliSense now provides:
// - Autocomplete for payload properties
// - Type checking for context properties  
// - Return type validation
// - Error handling suggestions
```

## Breaking Changes

### 1. Action Handler Signatures
```typescript
// Before
handler: (payload: any, context: ActionContext) => Promise<ActionResult>

// After
handler: (payload: TPayload, context: TContext) => Promise<ActionResult<TResult>>
```

### 2. Action Registration
```typescript
// Before
actionRegistry.register(action);

// After  
actionRegistry.register<MyPayload, MyContext, MyResult>(action);
```

### 3. Payload Structure
```typescript
// Before: Any structure allowed
payload: { anything: "goes" }

// After: Must extend BaseActionPayload
interface MyPayload extends BaseActionPayload {
  readonly myProperty: string;
}
```

## Validation Examples

### Basic Payload Validation
```typescript
const validator = createValidator<MyPayload>({
  type: Validators.string,
  myProperty: Validators.string,
  optionalFlag: Validators.optional(Validators.boolean),
});
```

### Complex Nested Validation
```typescript
const complexValidator = createValidator<ComplexPayload>({
  sites: Validators.array(Validators.string),
  config: Validators.object,
  buildOptions: (value: unknown): value is BuildOptions => {
    return typeof value === "object" && 
           value !== null &&
           typeof (value as any).clean === "boolean";
  },
});
```

## Testing Strategy

### 1. Unit Tests for Validators
```typescript
describe("buildActionValidator", () => {
  it("should validate correct payload", () => {
    const payload = {
      type: "scheduled",
      buildTarget: "all",
      notify: true,
    };
    expect(buildActionValidator(payload)).toBe(true);
  });

  it("should reject invalid payload", () => {
    const payload = {
      type: "scheduled",
      buildTarget: "invalid", // Type error!
    };
    expect(buildActionValidator(payload)).toBe(false);
  });
});
```

### 2. Integration Tests for Actions
```typescript
describe("Enhanced GitHub Action", () => {
  it("should process valid webhook", async () => {
    const action = createEnhancedGitHubAction(config);
    const payload: GitHubWebhookPayload = {
      // Properly typed payload
    };
    
    const result = await action.handler(payload, context);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      pullSuccess: true,
      affectedSites: expect.any(Array),
    });
  });
});
```

## Rollback Plan

If issues arise during migration:

1. **Keep old interfaces alongside new ones** during transition
2. **Feature flags** to switch between old and new systems
3. **Gradual migration** action by action rather than all at once
4. **Monitoring** to detect issues early

## Timeline

- **Week 1-2**: Core type system and enhanced registry
- **Week 3-4**: Migrate existing GitHub and scheduled actions  
- **Week 5-6**: Process management integration
- **Week 7**: Comprehensive testing and documentation
- **Week 8**: Production deployment with monitoring

## Success Metrics

- [ ] All actions have compile-time type checking
- [ ] Runtime validation catches 100% of payload errors
- [ ] Error rates decrease by 70% due to better error handling
- [ ] Developer productivity increases with better IntelliSense
- [ ] Action execution monitoring provides visibility into system health