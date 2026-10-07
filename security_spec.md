# Security Specification for Vivifrail System

## Data Invariants
- `UserProfile`: `age` must be between 0 and 150. `height` and `weight` must be positive. `gender` must be one of ['male', 'female', 'other'].
- `TestResult`: `userId` must match the authenticated user. Scores must be between 0 and 4. Times must be non-negative.

## The Dirty Dozen Payloads (Rejection Tests)

1. **Identity Spoofing**: Register profile with `uid` that doesn't match `request.auth.uid`.
2. **Field Injection**: Add `isAdmin: true` to `UserProfile`.
3. **Invalid Age**: Set `age: -5` or `age: 500`.
4. **Invalid Gender**: Set `gender: 'alien'`.
5. **Orphaned Results**: Create a `TestResult` where `userId` is someone else's.
6. **Result Tampering**: Attempt to `update` an existing result record.
7. **Mass Deletion**: Authenticated user attempts to delete someone else's profile.
8. **Broken Hierarchy**: Result with non-matching `userId` but created by authenticated user.
9. **String Poisoning**: `displayName` with 2MB of text.
10. **Type Mismatch**: `age` as a string instead of integer.
11. **Negative Time**: `rawWalkTime: -10.5`.
12. **Out of Range Score**: `balanceScore: 10`.

## Test Runner Plan
- Automated testing using `@firebase/rules-unit-testing`.
