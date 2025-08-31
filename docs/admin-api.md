# Admin Panel API Reference

## Overview

The admin panel provides a comprehensive set of APIs for managing your Dial Up Deploy installation. These APIs are accessible internally and include authentication, user management, and system configuration.

## Authentication

### Password Reset

#### Reset Admin Password

Allows resetting the admin password through a secure process.

**Endpoint**: `POST /admin/api/reset-password`

**Request Body**:
```json
{
  "currentPassword": "optional_current_password",
  "newPassword": "secure_new_password",
  "confirmPassword": "secure_new_password"
}
```

**Authentication Methods**:
1. **Existing Session**: If logged in, can reset password directly
2. **Recovery Mode**: 
   - Requires access to server's recovery mechanism
   - Can be initiated via CLI or directly on the server

**Response Codes**:
- `200 OK`: Password successfully reset
- `400 Bad Request`: Password validation failed
- `403 Forbidden`: Unauthorized reset attempt

**Password Requirements**:
- Minimum 12 characters
- Must include:
  - Uppercase letters
  - Lowercase letters
  - Numbers
  - Special characters

#### Recovery Mode

If standard reset fails, administrators can use server-side recovery:

```bash
# Server-side password reset
deploy admin reset-password
```

## User Management

### Create User

**Endpoint**: `POST /admin/api/users`

**Permissions**: Admin-only

**Request Body**:
```json
{
  "email": "user@example.com",
  "role": "viewer|editor|admin",
  "initialPassword": "secure_temporary_password"
}
```

### List Users

**Endpoint**: `GET /admin/api/users`

**Permissions**: Admin-only

**Response**:
```json
{
  "users": [
    {
      "id": "unique_user_id",
      "email": "user@example.com",
      "role": "editor",
      "lastLogin": "2025-08-31T12:00:00Z"
    }
  ]
}
```

## System Configuration

### Get System Status

**Endpoint**: `GET /admin/api/system/status`

**Response**:
```json
{
  "version": "1.0.0",
  "uptime": "72h30m",
  "sites": 12,
  "totalMemory": "4GB",
  "usedMemory": "1.2GB"
}
```

## Security Notes

- All admin APIs require authentication
- Rate limiting prevents brute-force attacks
- HTTPS required for all administrative interfaces
- Comprehensive audit logging for sensitive operations

## Error Handling

Standard error response format:
```json
{
  "error": {
    "code": "RESOURCE_FORBIDDEN",
    "message": "You do not have permission to perform this action",
    "details": "Additional context about the error"
  }
}
```

---

*Admin APIs are designed with security and usability in mind.*