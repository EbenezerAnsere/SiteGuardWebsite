// SiteGuard CI pipeline: environment check → install → static checks → test → build → audit → package → results.
//
// Node.js: uses the agent's Node if it is 22 or newer. Otherwise, on Linux agents (x64/arm64), it downloads
// the official Node.js release given by the NODE_VERSION parameter, verifies its SHA-256 checksum against
// nodejs.org and caches it in the workspace (.tools/), so no Jenkins admin setup is needed. Windows agents
// must have Node.js 22+ installed.
//
// Plugins: only Pipeline, Git and JUnit are required. If the Coverage plugin is installed the coverage report
// is published as a chart too; otherwise it is still archived as HTML.

// Run a shell command on Unix agents (with the downloaded Node first on PATH, if any) or a batch command on Windows.
def runCmd(String command) {
    if (isUnix()) {
        sh(env.NODE_BIN ? "export PATH=\"${env.NODE_BIN}:\$PATH\"; ${command}" : command)
    } else {
        bat command
    }
}

// Make sure a suitable Node.js is available, downloading a verified release on Linux agents if needed.
def ensureNode(String version) {
    if (!isUnix()) {
        if (bat(returnStatus: true, script: '@node scripts/check-node.mjs') != 0) {
            error 'Node.js 22 or newer is required on this Windows agent: install it from https://nodejs.org and make sure it is on the PATH.'
        }
        return
    }
    if (sh(returnStatus: true, script: 'command -v node >/dev/null 2>&1 && node scripts/check-node.mjs >/dev/null 2>&1') == 0) {
        echo 'Using the Node.js installed on this agent.'
        return
    }
    def machine = sh(returnStdout: true, script: 'uname -m').trim()
    def arch = (machine == 'aarch64' || machine == 'arm64') ? 'arm64' : 'x64'
    def dist = "node-v${version}-linux-${arch}"
    def tools = "${env.WORKSPACE}/.tools"
    echo "No Node.js 22+ on this agent: using official Node.js ${version} (${arch}), downloaded once from nodejs.org and cached in .tools/."
    sh """
        set -eu
        if [ ! -x "${tools}/${dist}/bin/node" ]; then
            mkdir -p "${tools}"
            cd "${tools}"
            curl -fsSLO "https://nodejs.org/dist/v${version}/${dist}.tar.gz"
            curl -fsSL "https://nodejs.org/dist/v${version}/SHASUMS256.txt" | grep " ${dist}.tar.gz\$" | sha256sum -c -
            tar -xzf "${dist}.tar.gz"
            rm -f "${dist}.tar.gz"
        fi
    """
    env.NODE_BIN = "${tools}/${dist}/bin"
}

pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    parameters {
        string(name: 'NODE_VERSION', defaultValue: '24.11.1', description: 'Node.js release to download on Linux agents that have no Node.js 22+ installed.')
    }

    environment {
        CI = 'true'                                    // turns on JUnit reporters and non-interactive tooling
        npm_config_cache = "${WORKSPACE}/.npm-cache"   // per-job npm cache, reused between builds
        npm_config_fund = 'false'
        npm_config_update_notifier = 'false'
    }

    stages {
        stage('Environment') {
            steps {
                script { ensureNode(params.NODE_VERSION ?: '24.11.1') }
                runCmd 'node --version'
                runCmd 'npm --version'
                runCmd 'node scripts/check-node.mjs'
            }
        }

        stage('Install') {
            parallel {
                stage('Backend dependencies') {
                    steps { dir('backend') { runCmd 'npm ci --no-audit' } }
                }
                stage('Frontend dependencies') {
                    steps { dir('frontend') { runCmd 'npm ci --no-audit' } }
                }
            }
        }

        stage('Static checks') {
            parallel {
                stage('Backend typecheck') {
                    steps { dir('backend') { runCmd 'npm run typecheck' } }
                }
                stage('Frontend typecheck') {
                    steps { dir('frontend') { runCmd 'npm run typecheck' } }
                }
                stage('Frontend lint') {
                    // Zero warnings allowed (oxlint --deny-warnings).
                    steps { dir('frontend') { runCmd 'npm run lint' } }
                }
                stage('Database migrations') {
                    // Validates the Drizzle migration history; needs no database.
                    steps { dir('backend') { runCmd 'npm run db:check' } }
                }
            }
        }

        stage('Test') {
            parallel {
                stage('Backend tests') {
                    // Scanner, SSRF guard, scoring, verification and performance tests against local fixture servers.
                    // Writes backend/reports/junit.xml and backend/coverage/ (fails if coverage drops below thresholds).
                    steps { dir('backend') { runCmd 'npm run test:ci' } }
                }
                stage('Frontend tests') {
                    // Helpers, plans, glossary links, components and charts.
                    // Writes frontend/reports/junit.xml and frontend/coverage/.
                    steps { dir('frontend') { runCmd 'npm run test:ci' } }
                }
            }
        }

        stage('Build') {
            parallel {
                stage('Backend build') {
                    steps { dir('backend') { runCmd 'npm run build' } }        // TypeScript → backend/dist
                }
                stage('Frontend build') {
                    steps { dir('frontend') { runCmd 'npm run build' } }       // Vite → frontend/dist
                }
            }
        }

        stage('Dependency audit') {
            // Production dependencies only. A known high/critical vulnerability marks the build UNSTABLE
            // (yellow) instead of failing it, so the team sees it without blocking every merge.
            steps {
                catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE', message: 'Backend production dependencies have known high/critical vulnerabilities') {
                    dir('backend') { runCmd 'npm audit --omit=dev --audit-level=high' }
                }
                catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE', message: 'Frontend production dependencies have known high/critical vulnerabilities') {
                    dir('frontend') { runCmd 'npm audit --omit=dev --audit-level=high' }
                }
            }
        }

        stage('Package') {
            steps {
                script {
                    ['backend/dist/index.js', 'frontend/dist/index.html'].each { path ->
                        if (!fileExists(path)) {
                            error "Build output missing: ${path}"
                        }
                    }
                    writeFile file: 'build-info.txt', text: """SiteGuard build
Build:   #${env.BUILD_NUMBER}
Job:     ${env.JOB_NAME}
Branch:  ${env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'n/a'}
Commit:  ${env.GIT_COMMIT ?: 'n/a'}
URL:     ${env.BUILD_URL ?: 'n/a'}

Contents:
  backend/   API server (run: npm ci --omit=dev && npm run db:migrate && npm start)
  frontend/  static site (serve frontend/dist behind the same origin as /api)
"""
                }
                archiveArtifacts(
                    artifacts: 'build-info.txt, backend/dist/**, backend/drizzle/**, backend/package.json, backend/package-lock.json, backend/drizzle.config.ts, backend/.env.example, frontend/dist/**',
                    fingerprint: true
                )
            }
        }
    }

    post {
        always {
            script {
                // ---- Results: tests
                def tests = junit(
                    testResults: 'backend/reports/junit.xml, frontend/reports/junit.xml',
                    allowEmptyResults: true
                )
                def summary = "Tests: ${tests.passCount} passed, ${tests.failCount} failed, ${tests.skipCount} skipped (of ${tests.totalCount})"
                echo summary
                currentBuild.description = summary

                // ---- Results: coverage (chart if the Coverage plugin is installed; HTML is always archived)
                try {
                    recordCoverage(
                        tools: [[parser: 'COBERTURA', pattern: 'backend/coverage/cobertura-coverage.xml, frontend/coverage/cobertura-coverage.xml']],
                        id: 'coverage',
                        name: 'Coverage',
                        sourceCodeRetention: 'NEVER'
                    )
                } catch (NoSuchMethodError ignored) {
                    echo 'Coverage plugin not installed: coverage HTML is archived under backend/coverage and frontend/coverage.'
                }
                archiveArtifacts artifacts: 'backend/reports/**, frontend/reports/**, backend/coverage/**, frontend/coverage/**', allowEmptyArchive: true
            }
        }
        success {
            echo 'SiteGuard: all checks passed and the build was packaged.'
        }
        unstable {
            echo 'SiteGuard: build is UNSTABLE: see failed tests or the Dependency audit stage.'
        }
        failure {
            echo 'SiteGuard: build FAILED: open the first red stage above for the error.'
        }
    }
}
