node("docker") {
  checkout scm

  stage("build") {
    sh "cd build && ./build"
  }
}