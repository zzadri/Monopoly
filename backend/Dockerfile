FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Monopoly.slnx .
COPY Monopoly.Domain/*.csproj Monopoly.Domain/
COPY Monopoly.Application/*.csproj Monopoly.Application/
COPY Monopoly.Infrastructure/*.csproj Monopoly.Infrastructure/
COPY Monopoly.Api/*.csproj Monopoly.Api/
RUN dotnet restore Monopoly.Api/Monopoly.Api.csproj
COPY . .
RUN dotnet publish Monopoly.Api/Monopoly.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# Npgsql probes for Kerberos/GSSAPI support at startup; without this the app
# still runs fine but logs a "Cannot load library libgssapi_krb5.so.2" warning.
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Monopoly.Api.dll"]
