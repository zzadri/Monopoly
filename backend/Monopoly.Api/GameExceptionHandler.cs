using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Monopoly.Api;

/// <summary>
/// Les refus du moteur de jeu sont des messages destinés au joueur ("Ce n'est
/// pas votre tour", "Fonds insuffisants") : on les renvoie tels quels plutôt
/// qu'en 500 opaque.
/// </summary>
public class GameExceptionHandler(ILogger<GameExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title) = exception switch
        {
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Introuvable"),
            UnauthorizedAccessException => (StatusCodes.Status403Forbidden, "Action refusée"),
            ArgumentException => (StatusCodes.Status400BadRequest, "Requête invalide"),
            InvalidOperationException => (StatusCodes.Status400BadRequest, "Action impossible"),
            _ => (StatusCodes.Status500InternalServerError, "Erreur interne")
        };

        if (status == StatusCodes.Status500InternalServerError)
            logger.LogError(exception, "Unhandled exception");

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = status == StatusCodes.Status500InternalServerError ? "Une erreur inattendue est survenue." : exception.Message,
        }, cancellationToken);

        return true;
    }
}
