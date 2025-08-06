# YAWP 2.0 Emergency Runbook

**⚠️ CRITICAL DOCUMENT - FOR EMERGENCY USE ONLY**

This document contains all essential information needed for emergency handoff, incident response, and system recovery for YAWP 2.0. Keep this document secure and up-to-date.

## 📋 Quick Reference

### Emergency Contacts
- **Development Team**: Contact through GitHub repository issues
- **AWS Account**: The Connell School organization
- **Primary Repository**: https://github.com/The-Connell-School/yawp-2.0

### Critical URLs
- **Production Application**: https://[app-runner-service-url] (See AWS App Runner console)
- **Staging Application**: https://[staging-app-runner-service-url] (if configured)

---

## 🏗️ System Architecture Overview

### High-Level Architecture
YAWP 2.0 is a modern educational platform serving educational institutions with student-teacher interactions, course management, and AI-powered document collaboration.

**Core Components:**
- **Frontend**: React Router v7 with Server-Side Rendering
- **Backend**: Node.js/Bun runtime with PostgreSQL database
- **Deployment**: AWS App Runner with ECR container registry
- **Database**: AWS RDS PostgreSQL
- **Infrastructure**: Terraform-managed AWS resources

### Technology Stack
```
Frontend: React Router v7 (SSR), TailwindCSS, shadcn/ui
Backend: Bun runtime, Prisma ORM
Database: PostgreSQL (AWS RDS)
Deployment: AWS App Runner + ECR
Infrastructure: Terraform
AI Services: Anthropic Claude, OpenAI GPT
Email: Resend API
Analytics: PostHog
Error Tracking: Sentry
```

### Multi-Tenant Architecture
- **Organizations**: Isolated tenants with user role management
- **User Types**: Students, Teachers, Admins, Super Owners
- **Access Control**: Role-based permissions with organization-level isolation

---

## 🔧 Infrastructure & Hosting Details

### AWS Resources (Primary Platform)

#### Core Infrastructure
- **Region**: us-east-1 (configurable via Terraform variables)
- **VPC**: Custom VPC with public/private subnets
- **Networking**: NAT Gateway for private subnet internet access
- **Security**: Security groups for App Runner, RDS, and bastion access

#### Application Hosting
- **Service**: AWS App Runner
- **CPU**: 1024 units (1 vCPU)
- **Memory**: 2048 MB (2 GB)
- **Container**: ECR repository with automated deployments
- **Port**: 8080
- **Health Check**: `/api/healthcheck` endpoint

#### Database
- **Service**: AWS RDS PostgreSQL
- **Instance Class**: db.t3.small (configurable)
- **Storage**: 20 GB allocated (configurable)
- **Multi-AZ**: False (single AZ deployment)
- **Backups**: 7-day retention period
- **Encryption**: Storage encrypted at rest
- **Access**: Private subnets only, accessible via App Runner and bastion

#### Container Registry
- **Service**: AWS ECR
- **Repository**: `[app-name]-[env]-web-app`
- **Image Scanning**: Enabled on push
- **Lifecycle**: Keep latest 5 images, expire older ones

#### Bastion Host
- **Instance**: EC2 t2.micro (Amazon Linux 2023)
- **Purpose**: Database access for maintenance
- **SSH Key**: Configurable via Terraform variables
- **Security**: SSH access from anywhere (port 22)

### Legacy Platform (Fly.io)
⚠️ **IMPORTANT**: No current applications run on Fly.io. All legacy apps exist there but are outdated versions. The current YAWP 2.0 application is fully deployed on AWS.

---

## 🔐 Security & Access Management

### Authentication & Authorization
- **Method**: Session-based authentication with bcrypt password hashing
- **Session Duration**: 30 days default expiration
- **CSRF Protection**: Honeypot implementation
- **Two-Factor Auth**: TOTP support available

### Role-Based Access Control (RBAC)
```
Super Owner: Platform-wide administrative access
Organization Owner: Full organization management
Admin: Organization administrative functions
Teacher: Course and student management
Student: Course participation and document collaboration
```

### Security Groups & Network Access
```
App Runner Security Group:
- Egress: All traffic to internet
- Purpose: Allows App Runner to connect to external services

RDS Security Group:
- Ingress: Port 5432 from App Runner SG and Bastion SG
- Purpose: Database access restricted to application and maintenance

Bastion Security Group:
- Ingress: Port 22 from anywhere (0.0.0.0/0)
- Egress: All traffic
- Purpose: SSH access for database maintenance
```

---

## 🔑 Credentials & Secrets Management

### AWS Secrets Manager
All application secrets are stored in AWS Secrets Manager with the naming pattern: `[app-name]-[env]-[secret-name]`

#### Required Secrets:
1. **Database URL** (`-db-url`)
   - Full PostgreSQL connection string
   - Format: `postgresql://username:password@host:port/database`

2. **Session Secret** (`-session-secret`)
   - Used for session encryption
   - Should be a strong random string

3. **Honeypot Secret** (`-honeypot-secret`)
   - CSRF protection mechanism
   - Random string for form validation

4. **AI Service Keys**:
   - **Anthropic API Key** (`-anthropic-key`): `sk-ant-...`
   - **OpenAI API Key** (`-openai-key`): `sk-...`
   - **OpenAI Organization ID** (`-openai-org`): `org-...`

5. **Email Service** (`-resend-api-key`)
   - Resend API key for transactional emails
   - Format: `re_...`

6. **Internal Token** (`-internal-token`)
   - API authentication for internal commands
   - Used for programmatic access

7. **Error Tracking** (`-sentry-dsn`)
   - Sentry DSN for error monitoring
   - Format: `https://...@sentry.io/...`

### IAM Roles & Permissions
```
App Runner Access Role:
- ECR: Pull images from repository
- Secrets Manager: Read application secrets
- Service: build.apprunner.amazonaws.com

App Runner Instance Role:
- Secrets Manager: Read all application secrets
- CloudWatch Logs: Create and write to log streams
- SSM: Read parameters (if needed)
- Service: tasks.apprunner.amazonaws.com
```

---

## 🌐 External Services Integration

### 1. Resend (Email Service)
- **Purpose**: Transactional email sending
- **API Endpoint**: `https://api.resend.com/emails`
- **Configuration**: 
  - API Key: Stored in AWS Secrets Manager
  - From Email: Configured via environment variable
- **Access**: Client should have access to Resend dashboard
- **Backup**: Consider alternative email providers (SendGrid, AWS SES)

### 2. Anthropic Claude (Primary AI)
- **Purpose**: Primary AI service for educational content generation
- **Model**: `claude-3-5-sonnet-20240620`
- **API Key**: Stored in AWS Secrets Manager (`ANTHROPIC_API_KEY`)
- **Usage**: Course content, tutoring, document assistance
- **Rate Limits**: Monitor usage in Anthropic dashboard

### 3. OpenAI (Secondary AI + Audio)
- **Purpose**: Secondary AI service and audio generation
- **Models**: `gpt-4-turbo-preview`, `tts-1`
- **API Key & Org**: Stored in AWS Secrets Manager
- **Usage**: Fallback AI service, text-to-speech generation
- **Rate Limits**: Monitor usage in OpenAI dashboard

### 4. PostHog (Analytics)
- **Purpose**: User analytics and product insights
- **Configuration**: API key and host URL in environment
- **Data**: User interactions, feature usage, performance metrics
- **Access**: Client should have access to PostHog dashboard

### 5. Sentry (Error Monitoring)
- **Purpose**: Application error tracking and performance monitoring
- **DSN**: Stored in AWS Secrets Manager
- **Integration**: Automatic error capture and reporting
- **Access**: Client should have access to Sentry project

---

## 📦 Deployment & CI/CD

### Container Build Process
```dockerfile
# Multi-stage build using Bun runtime
FROM oven/bun:1 AS base
# Install dependencies and build application
# Final production image runs on port 8080
```

### Deployment Pipeline
1. **Code Push**: Developer pushes to repository
2. **Container Build**: Docker image built with Bun runtime
3. **ECR Push**: Image tagged and pushed to AWS ECR
4. **App Runner Deploy**: Automatic deployment triggered
5. **Health Check**: `/api/healthcheck` endpoint verification

### Build Commands
```bash
# Install dependencies
bun install --ignore-scripts

# Generate Prisma client
bun prisma:generate

# Build application
bun web-app:build

# Start production server
bun run web-app:start
```

### Environment Configuration
App Runner service configured with:
- **Runtime Variables**: NODE_ENV, PORT, AI_MODEL, etc.
- **Secrets**: All sensitive values from AWS Secrets Manager
- **Auto Deployments**: Enabled for ECR image updates

---

## 🗄️ Database Management

### PostgreSQL Database (AWS RDS)
- **Engine**: PostgreSQL
- **Access**: Private subnet only
- **Connection**: Via App Runner (application) or bastion host (maintenance)
- **Backups**: 7-day automated backup retention
- **Encryption**: Storage encrypted at rest

### Database Schema Overview
```sql
-- Core user and organization management
Users, Organizations, Sessions, Passwords

-- Educational content structure
Courses, CourseModules, TeacherCourses, TeacherCourseModules

-- Document collaboration
Documents, DocumentComments, DocumentVersions

-- Student-teacher interactions
StudentProfiles, TeacherProfiles, CourseModuleSessions

-- File management
Uploads, UserImages, CourseImages
```

### Database Access Methods

#### Production Access (via Bastion Host)
```bash
# Connect to bastion host
ssh -i /path/to/key.pem ec2-user@[bastion-public-ip]

# From bastion, connect to RDS
psql postgresql://[username]:[password]@[rds-endpoint]:5432/[database]
```

#### Development Access
```bash
# Using DATABASE_URL from secrets
export DATABASE_URL="postgresql://..."
bun prisma studio  # Web-based database browser
bun prisma db push # Push schema changes
```

### Database Migrations
```bash
# Generate migration
bun prisma migrate dev --name migration_name

# Apply migrations (production)
bun prisma migrate deploy

# Reset database (development only)
bun prisma migrate reset
```

---

## 🚨 Emergency Procedures

### 1. Application Down / Unresponsive

**Immediate Actions:**
1. Check AWS App Runner service status in AWS Console
2. Review CloudWatch logs for error patterns
3. Verify ECR image availability and health
4. Check external service status (Resend, Anthropic, OpenAI)

**Diagnostic Commands:**
```bash
# Check health endpoint
curl https://[app-runner-url]/api/healthcheck

# View recent logs in CloudWatch
# Navigate to: /aws/apprunner/[app-name]-[env]
```

**Recovery Steps:**
1. Restart App Runner service if necessary
2. Deploy previous known-good ECR image
3. Scale App Runner service if under load
4. Check and rotate secrets if compromised

### 2. Database Connection Issues

**Symptoms:**
- Application errors related to database
- Timeout errors in logs
- User authentication failures

**Diagnostic Steps:**
1. Verify RDS instance status in AWS Console
2. Check security group rules for RDS access
3. Confirm App Runner VPC connector status
4. Test database connectivity from bastion host

**Recovery Actions:**
1. Restart RDS instance if necessary (causes downtime)
2. Update security group rules if network changes occurred
3. Verify and update database credentials in Secrets Manager
4. Check and resolve any disk space issues

### 3. External Service Failures

#### Resend (Email) Service Down:
- **Impact**: User registration, password resets, notifications
- **Workaround**: Temporarily disable email features or switch to alternative provider
- **Recovery**: Update RESEND_API_KEY and configuration

#### AI Services (Anthropic/OpenAI) Down:
- **Impact**: Course content generation, tutoring features
- **Workaround**: Fallback to alternative AI service or disable AI features
- **Recovery**: Verify API keys and service status

#### PostHog/Sentry Down:
- **Impact**: Analytics and error tracking (non-critical)
- **Workaround**: Application continues functioning
- **Recovery**: Update API keys if necessary

### 4. Security Incidents

**Suspected Compromise:**
1. **Immediate**: Rotate all secrets in AWS Secrets Manager
2. **Review**: Check CloudWatch logs for suspicious activity
3. **Isolate**: Consider temporarily stopping App Runner service
4. **Investigate**: Review user accounts and access patterns
5. **Notify**: Inform stakeholders of potential security incident

**Data Breach Response:**
1. Isolate affected systems
2. Preserve logs and evidence
3. Assess scope of data exposure
4. Notify users and authorities as required
5. Implement additional security measures

---

## 🔧 Maintenance & Troubleshooting

### Common Issues & Solutions

#### 1. Memory/Performance Issues
- **Symptoms**: Slow responses, timeout errors
- **Solutions**: 
  - Scale App Runner instance (increase CPU/memory)
  - Optimize database queries
  - Review application code for memory leaks

#### 2. Database Connection Pool Exhaustion
- **Symptoms**: "Connection pool exhausted" errors
- **Solutions**:
  - Restart App Runner service
  - Optimize database queries
  - Review Prisma connection settings

#### 3. Storage Space Issues
- **RDS Storage**: Monitor CloudWatch metrics, consider increasing allocated storage
- **ECR Storage**: Old images cleaned up automatically (5 image limit)

### Monitoring & Alerting

#### Key Metrics to Monitor:
- **App Runner**: CPU utilization, memory usage, request count
- **RDS**: CPU, memory, storage, connection count
- **Application**: Error rates, response times, user activity

#### Log Locations:
- **Application Logs**: CloudWatch `/aws/apprunner/[app-name]-[env]`
- **Database Logs**: RDS console (if enabled)
- **Infrastructure**: CloudTrail for AWS API calls

### Regular Maintenance Tasks

#### Weekly:
- Review error rates in Sentry dashboard
- Check AWS costs and resource utilization
- Verify backup completion status

#### Monthly:
- Update dependencies and security patches
- Review and rotate API keys as needed
- Test disaster recovery procedures

#### Quarterly:
- Full infrastructure review
- Security audit and penetration testing
- Performance optimization review

---

## 📞 Emergency Escalation

### Severity Levels

#### Critical (P0) - Immediate Response Required
- Application completely down
- Data loss or corruption
- Security breach
- **Response Time**: Immediate (< 15 minutes)

#### High (P1) - Urgent Response
- Partial service outage
- Performance severely degraded
- External service failures
- **Response Time**: < 2 hours

#### Medium (P2) - Standard Response
- Non-critical features affected
- Minor performance issues
- **Response Time**: < 24 hours

#### Low (P3) - Planned Response
- Feature requests
- Minor bugs
- **Response Time**: < 1 week

### Contact Procedures

1. **GitHub Issues**: Create issue in repository for tracking
2. **Direct Contact**: Reach out through established communication channels
3. **AWS Support**: If AWS infrastructure issues (requires support plan)
4. **Service Providers**: Direct contact with Resend, Anthropic, OpenAI for service-specific issues

---

## 📋 Configuration Reference

### Environment Variables

#### Required in Production:
```bash
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://...          # From AWS Secrets Manager
SESSION_SECRET=...                     # From AWS Secrets Manager
INTERNAL_COMMAND_TOKEN=...             # From AWS Secrets Manager
HONEYPOT_SECRET=...                    # From AWS Secrets Manager
ANTHROPIC_API_KEY=sk-ant-...           # From AWS Secrets Manager
OPENAI_API_KEY=sk-...                  # From AWS Secrets Manager
OPENAI_ORG_ID=org-...                  # From AWS Secrets Manager
RESEND_API_KEY=re_...                  # From AWS Secrets Manager
RESEND_FROM_EMAIL=noreply@domain.com   # Runtime environment variable
SENTRY_DSN=https://...                 # From AWS Secrets Manager
POSTHOG_API_KEY=...                    # Runtime environment variable
POSTHOG_HOST=https://app.posthog.com   # Runtime environment variable
AI_MODEL=claude-3-7-sonnet-20250219   # Runtime environment variable
```

### Terraform Variables Reference

#### Infrastructure Configuration:
```hcl
aws_region = "us-east-1"
env = "production" # or "staging"
app_name = "yawp"
db_instance_class = "db.t3.small"
db_allocated_storage = 20
```

#### Secrets (passed as variables):
```hcl
session_secret = "..."
internal_command_token = "..."
honeypot_secret = "..."
anthropic_api_key = "sk-ant-..."
openai_api_key = "sk-..."
openai_org_id = "org-..."
resend_api_key = "re_..."
resend_from_email = "noreply@domain.com"
sentry_dsn = "https://..."
posthog_api_key = "..."
posthog_host = "https://app.posthog.com"
bastion_public_key = "ssh-rsa ..."
```

---

## 🎯 Quick Recovery Checklist

### Application Recovery (15-minute response)
- [ ] Check App Runner service status
- [ ] Review CloudWatch logs for errors
- [ ] Verify ECR image availability
- [ ] Test health endpoint
- [ ] Check external service status
- [ ] Restart services if needed
- [ ] Verify functionality post-recovery

### Database Recovery
- [ ] Check RDS instance status
- [ ] Verify security group access
- [ ] Test connection from bastion host
- [ ] Review backup availability
- [ ] Check storage space
- [ ] Verify connectivity from application

### Security Incident Response
- [ ] Isolate affected systems
- [ ] Rotate all secrets immediately
- [ ] Review access logs
- [ ] Assess scope of impact
- [ ] Notify stakeholders
- [ ] Document incident details
- [ ] Implement preventive measures

---

## 📚 Additional Resources

### Documentation
- **Repository**: https://github.com/The-Connell-School/yawp-2.0
- **CLAUDE.md**: Comprehensive development guide
- **React Router v7**: https://reactrouter.com/
- **Prisma ORM**: https://prisma.io/docs
- **AWS App Runner**: https://docs.aws.amazon.com/apprunner/

### Service Dashboards
- **AWS Console**: https://console.aws.amazon.com/
- **Resend**: https://resend.com/
- **Anthropic**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/
- **PostHog**: https://app.posthog.com/
- **Sentry**: https://sentry.io/

### Support Contacts
- **AWS Support**: Available through AWS Console (requires support plan)
- **Resend Support**: support@resend.com
- **Anthropic Support**: Through console or documentation
- **OpenAI Support**: Through platform.openai.com

---

**Document Version**: 1.0  
**Last Updated**: 2025-08-06  
**Next Review**: 2025-11-06  

⚠️ **Keep this document secure and updated. Review quarterly or after major infrastructure changes.**