using System.Text.Json.Serialization;
using Mediator;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Monopoly.Api;
using Monopoly.Api.Endpoints;
using Monopoly.Api.Hubs;
using Monopoly.Application.Common.Interfaces;
using Monopoly.Application.Games.Engine;
using Monopoly.Infrastructure.Auth;
using Monopoly.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<MonopolyDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres"));
    options.EnableDetailedErrors();
    if (builder.Configuration.GetValue("Database:SensitiveLogging", false))
        options.EnableSensitiveDataLogging();
});
builder.Services.AddScoped<IMonopolyDbContext>(sp => sp.GetRequiredService<MonopolyDbContext>());

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddScoped<GameSessionService>();
builder.Services.AddScoped<ProgressionService>();
builder.Services.AddHostedService<IdleLobbyCleanupService>();

builder.Services.AddMediator(options => options.ServiceLifetime = ServiceLifetime.Scoped);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Authority sert à joindre Keycloak depuis l'API (réseau docker
        // interne) pour récupérer les métadonnées OIDC/JWKS — mais le
        // navigateur obtient ses tokens via une autre adresse (localhost:8081
        // publié), donc le claim "iss" du token ne matche jamais Authority.
        // On sépare explicitement les deux au lieu de les confondre.
        options.Authority = builder.Configuration["Keycloak:Authority"];
        options.Audience = builder.Configuration["Keycloak:Audience"];
        options.RequireHttpsMetadata = builder.Configuration.GetValue("Keycloak:RequireHttpsMetadata", true);

        var validIssuer = builder.Configuration["Keycloak:Issuer"] ?? builder.Configuration["Keycloak:Authority"];
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = validIssuer,
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
    options.AddPolicy("Front", policy => policy
        .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddExceptionHandler<GameExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddSignalR();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseExceptionHandler();

// Swagger en dev uniquement (Monopoly.md §12.1)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("Front");
app.UseAuthentication();
app.UseAuthorization();

app.MapHub<GameHub>("/hubs/game");
app.MapGamesEndpoints();
app.MapBoardsEndpoints();
app.MapLeaderboardEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

using (var scope = app.Services.CreateScope())
{
    await DefaultBoardSeeder.SeedAsync(scope.ServiceProvider.GetRequiredService<MonopolyDbContext>());
}

app.Run();
