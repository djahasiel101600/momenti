from django.urls import path, re_path

from . import views

urlpatterns = [
    path("api/health", views.HealthView.as_view()),
    path("api/app/settings", views.AppSettingsView.as_view()),
    path("api/auth/register", views.RegisterView.as_view()),
    re_path(r"^api/auth/(?:verify-otp|register/verify)$", views.VerifyOtpView.as_view()),
    path("api/auth/resend-otp", views.ResendOtpView.as_view()),
    re_path(r"^api/auth/(?:login|login-with-email-password)$", views.LoginView.as_view()),
    path("api/auth/me", views.MeView.as_view()),
    path("api/auth/logout", views.LogoutView.as_view()),
    re_path(
        r"^api/auth/(?:reset-password-request|forgot-password)$",
        views.ResetPasswordRequestView.as_view(),
    ),
    path("api/auth/reset-password", views.ResetPasswordConfirmView.as_view()),
    re_path(r"(?i)^api/entities/invitation(?:s)?$", views.InvitationListCreate.as_view()),
    re_path(
        r"(?i)^api/entities/invitation(?:s)?/(?P<invitation_id>[^/]+)$",
        views.InvitationDetail.as_view(),
    ),
    path("api/uploads", views.UploadView.as_view()),
    path("api/uploads/stream", views.StreamUploadView.as_view()),
    path("api/rsvps", views.RsvpListCreate.as_view()),
    re_path(r"^uploads/(?P<rest>.+)$", views.serve_upload_media),
    re_path(r"^uploads/$", views.serve_upload_media),
    re_path(r"^uploads$", views.serve_upload_media),
]
