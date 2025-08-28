# ===== build =====
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# кэшируемый restore
COPY Core/Core.csproj Core/
COPY Infrastructure/Infrastructure.csproj Infrastructure/
COPY Server/Server.csproj Server/
RUN dotnet restore Server/Server.csproj

# остальной код
COPY . .
RUN dotnet publish Server/Server.csproj -c Release -o /app/publish

# ===== runtime =====
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /app/wwwroot/avatars

ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080
ENTRYPOINT ["dotnet","Server.dll"]
