from django.urls import path, re_path

from . import admin_views, views

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
    path("api/billing/usage", views.BillingUsageView.as_view()),
    path("api/billing/subscription/activate", views.BillingActivateView.as_view()),
    path("api/billing/subscription/cancel", views.BillingCancelView.as_view()),
    path("api/billing/checkout", views.BillingCheckoutView.as_view()),
    path("api/billing/checkout/status", views.BillingCheckoutStatusView.as_view()),
    path("api/billing/webhook", views.BillingWebhookView.as_view()),
    path("api/analytics/track", views.InvitationViewTrackView.as_view()),
    path("api/analytics/views", views.InvitationAnalyticsView.as_view()),
    path("api/templates", views.TemplateListView.as_view()),
    path("api/templates/publish", views.TemplatePublishView.as_view()),
    re_path(
        r"^api/templates/(?P<slug>[^/]+)$",
        views.TemplateDetailView.as_view(),
    ),
    # Admin API (staff / role=admin only)
    path("api/admin/overview", admin_views.AdminOverviewView.as_view()),
    path("api/admin/users", admin_views.AdminUsersView.as_view()),
    path("api/admin/users/<str:user_id>", admin_views.AdminUsersView.as_view()),
    path("api/admin/database", admin_views.AdminDatabaseView.as_view()),
    path("api/admin/config", admin_views.AdminConfigView.as_view()),
    path("api/admin/logs", admin_views.AdminLogsView.as_view()),
    re_path(r"^uploads/(?P<rest>.+)$", views.serve_upload_media),
    re_path(r"^uploads/$", views.serve_upload_media),
    re_path(r"^uploads$", views.serve_upload_media),
]
