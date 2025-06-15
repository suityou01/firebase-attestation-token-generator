## Installation and setup
Clone repo
Create firebase-config folder
Generate new private key in Firebase Console
Add private key file to firebase-config folder
Get Firebase app id from Firebase Console
Add private key file name and Firebase app id to compose.yaml

```yaml
```

## Implementation Strategy

Here's the recommended approach:

### 1. **Pre-test Token Generation**
Before running your load tests, generate a large pool of tokens:
```bash
curl -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{"totalTokens": 200, "batchSize": 20}'
```

### 2. **Token Refresh During Tests**
The K6 script monitors token expiry and calls the refresh service when needed. You can also set up a background process to continuously refresh tokens.

### 3. **Configuration Options**

Create a `tokens.json` file structure:
```json
[
  {
    "token": "eyJhbGci...",
    "expiresAt": "2025-06-14T14:30:00.000Z",
    "createdAt": "2025-06-14T14:00:00.000Z",
    "ttl": 1800
  }
]
```

### 4. **Running the Load Test**
```bash
# Start token generator service
node token-generator-service.js

# Run K6 test with environment variables
k6 run \
  -e TARGET_ENDPOINT=https://your-api.com/protected \
  -e TOKEN_REFRESH_ENDPOINT=http://localhost:3000/refresh-tokens \
  k6-appcheck-script.js
```

## Key Considerations

- **Token Rotation**: The script uses round-robin selection to distribute token usage
- **Expiry Management**: Tokens are refreshed 5 minutes before expiry
- **Error Handling**: Graceful fallback when tokens are unavailable
- **Rate Limiting**: Be mindful of Firebase App Check quotas
- **Security**: Keep service account keys secure and don't commit them to version control

This approach allows you to run extended load tests while properly managing App Check token lifecycle. The token pool ensures you have enough valid tokens throughout your test duration, even for tests longer than the token TTL.

# Firebase App Check Token Generator Service - cURL Commands

# =============================================================================
# 1. REFRESH TOKENS ENDPOINT
# =============================================================================

# Generate 10 tokens with default 30-minute TTL
curl -X POST http://localhost:3000/refresh-tokens \
  -H "Content-Type: application/json" \
  -d '{}'

# Generate 20 tokens with 45-minute TTL
curl -X POST http://localhost:3000/refresh-tokens \
  -H "Content-Type: application/json" \
  -d '{
    "count": 20,
    "ttl": 2700
  }'

# Generate 5 tokens with 1-hour TTL
curl -X POST http://localhost:3000/refresh-tokens \
  -H "Content-Type: application/json" \
  -d '{
    "count": 5,
    "ttl": 3600
  }'

# =============================================================================
# 2. PREGENERATE POOL ENDPOINT
# =============================================================================

# Generate default pool (100 tokens in batches of 10)
curl -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{}'

# Generate large pool for extended load testing
curl -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{
    "totalTokens": 500,
    "batchSize": 25
  }'

# Generate small test pool
curl -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{
    "totalTokens": 50,
    "batchSize": 10
  }'

# Generate pool with custom batch size for rate limiting
curl -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{
    "totalTokens": 200,
    "batchSize": 5
  }'

# =============================================================================
# 3. GET TOKENS STATUS ENDPOINT
# =============================================================================

# Check current token pool status
curl -X GET http://localhost:3000/tokens

# Get token status with pretty formatting
curl -X GET http://localhost:3000/tokens | jq '.'

# Get just the count of valid tokens
curl -X GET http://localhost:3000/tokens | jq '.valid'

# =============================================================================
# 4. TESTING YOUR PROTECTED ENDPOINT WITH TOKENS
# =============================================================================

# First, get a token from the pool
TOKEN=$(curl -s http://localhost:3000/tokens | jq -r '.tokens[0].token')

# Test your protected endpoint with the App Check token
curl -X GET https://your-api.com/protected-endpoint \
  -H "Content-Type: application/json" \
  -H "X-Firebase-AppCheck: $TOKEN"

# POST request with App Check token
curl -X POST https://your-api.com/protected-endpoint \
  -H "Content-Type: application/json" \
  -H "X-Firebase-AppCheck: $TOKEN" \
  -d '{
    "data": "your request payload"
  }'

# =============================================================================
# 5. BATCH OPERATIONS
# =============================================================================

# Generate tokens for different test scenarios
echo "Generating tokens for smoke tests..."
curl -X POST http://localhost:3000/refresh-tokens \
  -H "Content-Type: application/json" \
  -d '{"count": 10, "ttl": 1800}'

echo "Generating tokens for load tests..."
curl -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{"totalTokens": 300, "batchSize": 15}'

echo "Checking final token count..."
curl -X GET http://localhost:3000/tokens | jq '.valid'

# =============================================================================
# 6. MONITORING AND MAINTENANCE
# =============================================================================

# Monitor token expiry (run periodically)
curl -s http://localhost:3000/tokens | \
  jq '{
    total: .total,
    valid: .valid,
    expired: .expired,
    expiry_times: [.tokens[].expiresAt] | sort
  }'

# Refresh tokens when low (example threshold check)
VALID_COUNT=$(curl -s http://localhost:3000/tokens | jq '.valid')
if [ "$VALID_COUNT" -lt 50 ]; then
  echo "Low token count ($VALID_COUNT), refreshing..."
  curl -X POST http://localhost:3000/refresh-tokens \
    -H "Content-Type: application/json" \
    -d '{"count": 100, "ttl": 1800}'
fi

# =============================================================================
# 7. ERROR HANDLING EXAMPLES
# =============================================================================

# Test with verbose output to see errors
curl -v -X POST http://localhost:3000/refresh-tokens \
  -H "Content-Type: application/json" \
  -d '{"count": 5}'

# Test with timeout for slow responses
curl --max-time 30 -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{"totalTokens": 1000, "batchSize": 50}'

# Test with retry on failure
curl --retry 3 --retry-delay 5 -X GET http://localhost:3000/tokens

# =============================================================================
# 8. PRODUCTION USAGE PATTERNS
# =============================================================================

# Pre-load test setup
echo "Setting up tokens for load test..."
curl -X POST http://localhost:3000/pregenerate-pool \
  -H "Content-Type: application/json" \
  -d '{
    "totalTokens": 1000,
    "batchSize": 20
  }' && echo "✓ Token pool ready"

# During test monitoring
watch -n 30 'curl -s http://localhost:3000/tokens | jq "{valid: .valid, expired: .expired}"'

# Post-test cleanup check
curl -s http://localhost:3000/tokens | \
  jq 'if .valid < 10 then "⚠️ Low tokens remaining" else "✓ Sufficient tokens" end'

Here are comprehensive cURL commands for each endpoint of the Firebase App Check Token Generator Service. The commands are organized by use case and include examples for different scenarios you might encounter during load testing.

## Quick Reference

**Most Common Commands:**

1. **Generate initial token pool:**
   ```bash
   curl -X POST http://localhost:3000/pregenerate-pool \
     -H "Content-Type: application/json" \
     -d '{"totalTokens": 200, "batchSize": 20}'
   ```

2. **Check token status:**
   ```bash
   curl -X GET http://localhost:3000/tokens | jq '.'
   ```

3. **Refresh tokens during test:**
   ```bash
   curl -X POST http://localhost:3000/refresh-tokens \
     -H "Content-Type: application/json" \
     -d '{"count": 50, "ttl": 1800}'
   ```

## Usage Workflow

1. **Before Load Test:** Use the pregenerate-pool endpoint to create a large pool of tokens
2. **During Load Test:** Monitor token count with the GET /tokens endpoint
3. **Token Refresh:** Use refresh-tokens endpoint when token count gets low
4. **Testing:** Extract tokens and test your protected endpoints

The monitoring examples with `watch` and conditional refresh based on token count are particularly useful for maintaining token availability during long-running load tests.

# Running in AWS Fargate

AWS Fargate Deployment Guide
This guide walks through deploying your Express.js application to AWS Fargate using ECS.
Prerequisites

AWS CLI configured with appropriate permissions
Docker installed locally
An AWS account with ECR, ECS, and VPC permissions

Step 1: Build and Push Docker Image
bash# Create ECR repository
aws ecr create-repository --repository-name fargate-express-app --region eu-west-2

# Get login token
aws ecr get-login-password --region eu-west-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-west-2.amazonaws.com

# Build image
docker build -t fargate-express-app .

# Tag image
docker tag fargate-express-app:latest <account-id>.dkr.ecr.eu-west-2.amazonaws.com/fargate-express-app:latest

# Push image
docker push <account-id>.dkr.ecr.eu-west-2.amazonaws.com/fargate-express-app:latest
Step 2: Create ECS Task Definition
Create task-definition.json:
json{
  "family": "fargate-express-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "fargate-express-app",
      "image": "<account-id>.dkr.ecr.eu-west-2.amazonaws.com/fargate-express-app:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/fargate-express-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "node healthcheck.js"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
Register the task definition:
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```
Step 3: Create CloudWatch Log Group
```bash
aws logs create-log-group --log-group-name /ecs/fargate-express-app --region us-east-1
```
Step 4: Create ECS Cluster
```bash
aws ecs create-cluster --cluster-name fargate-express-cluster --capacity-providers FARGATE --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
```
Step 5: Create Security Group
```bash
aws ec2 create-security-group \
  --group-name fargate-express-sg \
  --description "Security group for Fargate Express app" \
  --vpc-id <your-vpc-id>
```
# Add inbound rule for port 3000
```bash
aws ec2 authorize-security-group-ingress \
  --group-id <security-group-id> \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0
```
Step 6: Create ECS Service
Create service-definition.json:
```js
json{
  "serviceName": "fargate-express-service",
  "cluster": "fargate-express-cluster",
  "taskDefinition": "fargate-express-app",
  "desiredCount": 2,
  "launchType": "FARGATE",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["subnet-12345", "subnet-67890"],
      "securityGroups": ["sg-12345"],
      "assignPublicIp": "ENABLED"
    }
  },
  "loadBalancers": [
    {
      "targetGroupArn": "<target-group-arn>",
      "containerName": "fargate-express-app",
      "containerPort": 3000
    }
  ]
}
```
Create the service:
```bash
aws ecs create-service --cli-input-json file://service-definition.json
```
Step 7: Create Application Load Balancer (Optional)
```bash
aws elbv2 create-load-balancer \
  --name fargate-express-alb \
  --subnets subnet-12345 subnet-67890 \
  --security-groups sg-12345
```

# Create target group
```bash
aws elbv2 create-target-group \
  --name fargate-express-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id <your-vpc-id> \
  --target-type ip \
  --health-check-path /health
```

# Create listener
```bash
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=<target-group-arn>
```
Environment Variables
You can set environment variables in the task definition or use AWS Systems Manager Parameter Store:
```js
{
"secrets": [
  {
    "name": "FIREBASE_APP_ID",
    "valueFrom": "arn:aws:ssm:eu-west-2:<account-id>:parameter/fargate-express-app/FIREBASE_APP_ID"
  }
]
}
```
# Monitoring and Logging

Logs are automatically sent to CloudWatch Logs
Set up CloudWatch alarms for CPU/memory usage
Use AWS X-Ray for distributed tracing (add X-Ray daemon as sidecar)

## Deployment Commands

### Update service with new task definition
```bash
aws ecs update-service \
  --cluster fargate-express-cluster \
  --service fargate-express-service \
  --task-definition fargate-express-app:2
```
### Scale service
```bash
aws ecs update-service \
  --cluster fargate-express-cluster \
  --service fargate-express-service \
  --desired-count 3
```

## Cost Optimization

Use Fargate Spot for non-production workloads
Set appropriate CPU/memory limits
Consider using ARM-based instances (Graviton2)
Implement auto-scaling based on metrics

## Security Best Practices

Use IAM roles for task execution and task roles
Store secrets in AWS Secrets Manager or Parameter Store
Use VPC endpoints to avoid internet traffic
Enable VPC Flow Logs for network monitoring
Use security groups to restrict access
Regularly update base images and dependencies

## Troubleshooting
###Check service status
```bash
aws ecs describe-services --cluster fargate-express-cluster --services fargate-express-service
```

### View logs
```bash
aws logs tail /ecs/fargate-express-app --follow
```

### Check task status
```bash
aws ecs list-tasks --cluster fargate-express-cluster --service-name fargate-express-service
aws ecs describe-tasks --cluster fargate-express-cluster --tasks <task-arn>
```
