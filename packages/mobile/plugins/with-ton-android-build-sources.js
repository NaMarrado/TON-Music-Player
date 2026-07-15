function getFfmpegKitAndroidBootstrapSource() {
  return `def ffmpegKitRepoDir = new File(rootDir, '.gradle/ffmpeg-kit-repo')
def ffmpegKitArtifactVersion = '6.0-2'
def ffmpegKitArtifactDir = new File(ffmpegKitRepoDir, "com/arthenica/ffmpeg-kit-audio/\${ffmpegKitArtifactVersion}")
def ffmpegKitAarFile = new File(ffmpegKitArtifactDir, "ffmpeg-kit-audio-\${ffmpegKitArtifactVersion}.aar")
def ffmpegKitPomFile = new File(ffmpegKitArtifactDir, "ffmpeg-kit-audio-\${ffmpegKitArtifactVersion}.pom")
def ffmpegKitAarUrl = 'https://raw.githubusercontent.com/DucLQ92/ffmpeg-kit-audio/main/com/arthenica/ffmpeg-kit-audio/6.0-2/ffmpeg-kit-audio-6.0-2.aar'
def ffmpegKitAarSha256 = 'a53e5628fca2a17aa8f8fdc14322d39b9e6d22e9e9886cda8eded47a058cfcf6'
def ffmpegKitPomContents = """<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.arthenica</groupId>
  <artifactId>ffmpeg-kit-audio</artifactId>
  <version>\${ffmpegKitArtifactVersion}</version>
  <packaging>aar</packaging>
  <dependencies>
    <dependency>
      <groupId>com.arthenica</groupId>
      <artifactId>smart-exception-common</artifactId>
      <version>0.2.1</version>
    </dependency>
    <dependency>
      <groupId>com.arthenica</groupId>
      <artifactId>smart-exception-java</artifactId>
      <version>0.2.1</version>
    </dependency>
  </dependencies>
</project>
"""

def sha256Hex = { File file ->
    def digest = java.security.MessageDigest.getInstance('SHA-256')
    file.withInputStream { input ->
        byte[] buffer = new byte[8192]
        int read = 0
        while ((read = input.read(buffer)) != -1) {
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().collect { String.format('%02x', it) }.join()
}

def downloadFile = { String sourceUrl, File targetFile ->
    def connection = new URL(sourceUrl).openConnection()
    connection.setRequestProperty('User-Agent', 'TON-Android-Build')
    connection.connect()

    try {
        if (connection instanceof java.net.HttpURLConnection) {
            def statusCode = connection.responseCode
            if (statusCode >= 400) {
                def message = "Failed to download FFmpegKit Android artifact from " + sourceUrl + ": HTTP " + statusCode
                if (connection.responseMessage != null) {
                    message += " " + connection.responseMessage
                }
                throw new GradleException(message)
            }
        }

        targetFile.withOutputStream { output ->
            connection.getInputStream().withCloseable { input ->
                input.transferTo(output)
            }
        }
    } finally {
        if (connection instanceof java.net.HttpURLConnection) {
            connection.disconnect()
        }
    }
}

def ensureLocalFfmpegKitArtifact = {
    ffmpegKitArtifactDir.mkdirs()

    if (!ffmpegKitAarFile.exists() || sha256Hex(ffmpegKitAarFile) != ffmpegKitAarSha256) {
        if (ffmpegKitAarFile.exists()) {
            ffmpegKitAarFile.delete()
        }

        logger.lifecycle("Downloading FFmpegKit Android artifact into \${ffmpegKitAarFile}")
        downloadFile(ffmpegKitAarUrl, ffmpegKitAarFile)

        def actualSha = sha256Hex(ffmpegKitAarFile)
        if (actualSha != ffmpegKitAarSha256) {
            ffmpegKitAarFile.delete()
            throw new GradleException("Downloaded FFmpegKit artifact checksum mismatch. Expected \${ffmpegKitAarSha256}, got \${actualSha}.")
        }
    }

    if (!ffmpegKitPomFile.exists() || ffmpegKitPomFile.text != ffmpegKitPomContents) {
        ffmpegKitPomFile.text = ffmpegKitPomContents
    }
}

ensureLocalFfmpegKitArtifact()`;
}

module.exports = { getFfmpegKitAndroidBootstrapSource };
