# Bluesky ATProto Integration Plan

## 🌟 Vision Extension

Enhance Dial Up Deploy's community platform by integrating Bluesky's AT Protocol, transforming deployed sites from isolated projects into discoverable, social objects that connect the broader developer community migrating from Glitch.

## 🎯 Integration Goals

### Social Discovery
- Sites become discoverable through the Bluesky social graph
- Developers can follow each other's deployment activities  
- Popular frameworks and projects surface naturally
- Community building extends beyond single VPS instances

### Seamless Identity
- Optional Bluesky authentication alongside session-based auth
- Leverage existing social connections for collaboration
- Reduce onboarding friction for Bluesky users

### Content Sharing
- Automatic deployment announcements to Bluesky feeds
- Rich preview cards for deployed sites
- Community showcasing through social posts

## 📋 Implementation Stages

### Stage 7: Basic Bluesky Authentication (2-3 weeks)
*Prerequisite: Stage 2 (User Self-Service Portal) completed*

**Deliverables:**
- OAuth 2.0 client integration with `@atproto/oauth-client-node`
- Alternative login flow: "Sign in with Bluesky"
- DID-based user mapping alongside traditional sessions
- User preference for authentication method

**Technical Requirements:**
```typescript
// New authentication adapter
interface BlueskyAuthAdapter {
  login(handle: string): Promise<OAuthSession>
  callback(code: string): Promise<User>
  refreshToken(session: OAuthSession): Promise<OAuthSession>
}

// Enhanced user schema
interface User {
  id: string
  email?: string           // Traditional auth
  blueskyDid?: string      // ATProto identity
  blueskyHandle?: string   // Display handle
  authProvider: 'local' | 'bluesky' | 'both'
  // ... existing fields
}
```

**User Experience:**
- Login page shows both options
- Bluesky users can link existing accounts
- Graceful fallback to traditional auth

### Stage 8: Deployment Records Schema (1-2 weeks)
*Can be developed in parallel with Stage 7*

**Deliverables:**
- Custom Lexicon schema `xyz.dialup.deployment` 
- Record creation service for new deployments
- Schema validation and type generation
- Privacy controls (public/private deployments)

**Schema Design:**
```json
{
  "lexicon": 1,
  "id": "xyz.dialup.deployment",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["url", "name", "status", "deployedAt"],
        "properties": {
          "url": {"type": "string", "format": "uri"},
          "name": {"type": "string", "maxLength": 100},
          "description": {"type": "string", "maxLength": 300},
          "status": {"type": "string", "enum": ["active", "stopped", "building", "error"]},
          "framework": {"type": "string"},
          "visibility": {"type": "string", "enum": ["public", "private"], "default": "public"},
          "deployedAt": {"type": "string", "format": "datetime"},
          "instanceUrl": {"type": "string"},
          "tags": {"type": "array", "items": {"type": "string"}}
        }
      }
    }
  }
}
```

### Stage 9: Social Features Integration (3-4 weeks) 
*Prerequisite: Stages 7 & 8 completed*

**Deliverables:**
- Automatic deployment announcements (opt-in)
- Rich text post composer with site embeds
- Social discovery page showing community deployments
- Follow/unfollow developers functionality
- Activity feed for followed users' deployments

**Key Components:**
```typescript
// Social sharing service
class DeploymentSocialService {
  async announceDeployment(deployment: Deployment, options: {
    autoShare: boolean
    customMessage?: string
    includePreview: boolean
  }): Promise<ATProtoPost>

  async createRichPost(text: string, deployment?: Deployment): Promise<ATProtoPost>
  
  async getFollowingActivity(userDid: string): Promise<DeploymentActivity[]>
}

// Discovery service
class SocialDiscoveryService {
  async getPopularSites(timeframe: '24h' | '7d' | '30d'): Promise<PopularSite[]>
  async getTrendingFrameworks(): Promise<FrameworkStats[]>
  async getFollowedUserSites(userDid: string): Promise<Deployment[]>
}
```

**UI Components:**
- Social sharing toggle in deployment modal
- Community discovery page (`/discover`)
- User profile pages with deployment history
- Activity feed widget for dashboard

### Stage 10: Community Dashboard (2 weeks)
*Integration with existing admin interface*

**Deliverables:**
- Admin analytics for Bluesky engagement
- Community health metrics
- Moderation tools for social features
- Instance-level social settings

**Admin Features:**
- Toggle Bluesky integration on/off
- View community engagement metrics
- Moderate public deployment records
- Configure default privacy settings

## 🔄 Integration with Existing Plan

### Enhanced User Portal (Stage 2)
**Additional Requirements:**
- Bluesky auth option on login/register pages
- Profile settings for social preferences
- Privacy controls for deployment sharing

### Web Editor Enhancement (Stage 3)
**Social Features:**
- "Share to Bluesky" button in deployment modal
- Social preview of sites during development
- Community template discovery

### Resource Dashboard (Stage 4)
**Community Metrics:**
- Social engagement stats per deployment  
- Discovery metrics (views from social)
- Community ranking/popularity

## 🛡️ Privacy & Security Considerations

### User Control
- **Explicit opt-in** for all social features
- **Granular privacy controls** per deployment
- **Easy disconnect** from Bluesky integration
- **Local-first approach** - works fully without ATProto

### Security Measures
- OAuth PKCE flow for public clients
- Encrypted session storage for ATProto tokens
- Rate limiting for social API calls
- Content validation for shared posts

### Moderation
- Instance admin can disable social features
- Respect ATProto moderation preferences
- Content filtering for public deployments
- Report/block functionality

## 📊 Success Metrics

### Adoption
- % of users enabling Bluesky auth
- % of deployments shared publicly
- Social engagement rates (likes, reposts)
- Cross-instance discovery metrics

### Community Growth
- New user signups from Bluesky discovery
- Developer follow relationships formed
- Template sharing through social posts
- Framework adoption influenced by social trends

### Technical Health
- OAuth success/failure rates
- ATProto API response times
- Social feature usage patterns
- Privacy setting adoption rates

## 🚀 Deployment Strategy

### Phase A: Soft Launch (Stages 7-8)
- Deploy to staging environment
- Test with small group of Bluesky users
- Validate OAuth flow and record creation
- Gather initial feedback

### Phase B: Community Beta (Stage 9)
- Enable on production with feature flag
- Invite existing platform users to test
- Monitor social API rate limits
- Iterate based on usage patterns  

### Phase C: Full Launch (Stage 10)
- Public announcement on Bluesky
- Complete admin dashboard
- Documentation and tutorials
- Community guidelines

## 🔧 Technical Architecture

### Database Schema Extensions
```sql
-- Add to existing user table
ALTER TABLE users ADD COLUMN bluesky_did TEXT;
ALTER TABLE users ADD COLUMN bluesky_handle TEXT;
ALTER TABLE users ADD COLUMN bluesky_session TEXT; -- encrypted
ALTER TABLE users ADD COLUMN social_preferences JSON;

-- New social tables
CREATE TABLE deployment_social (
  deployment_id INTEGER REFERENCES deployments(id),
  atproto_uri TEXT,
  visibility TEXT DEFAULT 'public',
  social_stats JSON,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE social_follows (
  follower_did TEXT,
  following_did TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (follower_did, following_did)
);
```

### API Extensions
```typescript
// New routes
POST /api/auth/bluesky/login
POST /api/auth/bluesky/callback  
GET  /api/social/discover
POST /api/social/share/:deploymentId
GET  /api/social/activity
POST /api/social/follow/:did
DELETE /api/social/follow/:did

// Enhanced deployment endpoints
POST /api/deployments (now creates ATProto record if enabled)
PUT  /api/deployments/:id (updates social visibility)
```

### Background Jobs
```typescript
// Social sync service
class SocialSyncJob {
  // Sync deployment status to ATProto records
  // Update social stats from Bluesky API
  // Clean up expired OAuth tokens
  // Generate discovery rankings
}
```

## 🎨 UI/UX Enhancements

### Login Page
- Prominent "Sign in with Bluesky" button
- Clear explanation of benefits
- Option to link accounts later

### Deployment Modal
- Social sharing toggle with preview
- Custom message composer
- Privacy setting selection
- Post preview before sharing

### Discovery Page
- Trending deployments grid
- Framework popularity charts  
- Developer activity feed
- Search by handle/framework/keywords

### User Profile
- Bluesky handle display
- Deployment history with social stats
- Follow/unfollow buttons
- Social preferences settings

## ⚡ Quick Wins

### Immediate Value (Week 1)
1. **OAuth research spike** - validate integration approach
2. **Schema design** - define deployment record structure  
3. **UI mockups** - design social features workflow

### Early Feedback (Week 2-3)
1. **Basic auth flow** - get Bluesky login working
2. **Simple record creation** - deployments create ATProto records
3. **Privacy controls** - users can opt out completely

## 🤝 Community Impact

### For Current Users
- **Optional enhancement** - existing workflows unchanged
- **Social discovery** - find similar projects and developers
- **Showcase platform** - easily share cool deployments

### For Bluesky Community  
- **Migration path** - smooth transition from Glitch
- **Developer discovery** - find collaborators and projects
- **Platform awareness** - showcase self-hosting capabilities

### For Dial Up Deploy Platform
- **User growth** - organic discovery through social graph
- **Community building** - stronger user retention
- **Feature differentiation** - unique social hosting platform

## 🎯 Success Definition

The Bluesky integration succeeds when:
1. **Glitch refugees** can smoothly migrate with their social connections intact
2. **Community discovery** drives organic user growth
3. **Developer collaboration** increases across VPS instances  
4. **Platform showcasing** demonstrates self-hosting benefits
5. **Privacy-first approach** maintains user trust and control

This transforms Dial Up Deploy from a hosting platform into a **social development community** while preserving its core simplicity and self-hosting philosophy.