allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

subprojects {
    val configureNamespace = {
        if (project.hasProperty("android")) {
            val android = project.extensions.findByName("android")
            if (android != null) {
                try {
                    val getNamespace = android.javaClass.methods.firstOrNull { it.name == "getNamespace" }
                    val currentNamespace = getNamespace?.invoke(android)
                    if (currentNamespace == null) {
                        val setNamespace = android.javaClass.methods.firstOrNull { 
                            it.name == "setNamespace" && it.parameterTypes.size == 1 && it.parameterTypes[0] == String::class.java 
                        }
                        var ns = project.group.toString()
                        if (ns.isEmpty() || ns == "unspecified") {
                            ns = "com.example.${project.name.replace("-", ".")}"
                        }
                        setNamespace?.invoke(android, ns)
                    }
                } catch (e: Exception) {
                    // Ignore errors
                }
            }
        }
    }

    if (project.state.executed) {
        configureNamespace()
    } else {
        project.afterEvaluate {
            configureNamespace()
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
