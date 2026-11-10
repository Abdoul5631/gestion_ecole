from django.contrib import admin
from .models import Notification, SmsOutbox


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['titre', 'destinataire', 'type', 'lu', 'created_at']
    list_filter = ['type', 'lu']
    search_fields = ['titre', 'destinataire__username']


@admin.register(SmsOutbox)
class SmsOutboxAdmin(admin.ModelAdmin):
    list_display = ['telephone', 'type', 'statut', 'provider', 'created_at']
    list_filter = ['statut', 'type']
    search_fields = ['telephone', 'message']
