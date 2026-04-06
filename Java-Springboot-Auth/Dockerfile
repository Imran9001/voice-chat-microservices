# Builds the JAR file

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
# Copys the pom.xml and download dependencies first
COPY pom.xml .
RUN mvn dependency:go-offline

# Copy the source code and build the JAR
COPY src ./src
RUN mvn clean package -DskipTests


FROM eclipse-temurin:21-jre-alpine
WORKDIR /app


COPY --from=build /app/target/*.jar app.jar

# Exposes the port Spring Boot runs on
EXPOSE 8080

# Starts the application
ENTRYPOINT ["java", "-jar", "app.jar"]