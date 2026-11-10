from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('eleves', '0004_add_date_naissance_sexe_lieu'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type', models.CharField(choices=[('ABSENCE', 'Absence'), ('FRAIS', 'Frais de scolarité'), ('BULLETIN', 'Bulletin'), ('INFO', 'Information')], default='INFO', max_length=12)),
                ('titre', models.CharField(max_length=160)),
                ('message', models.TextField()),
                ('lu', models.BooleanField(default=False)),
                ('lien', models.CharField(blank=True, default='', max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('destinataire', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL)),
                ('eleve', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='notifications', to='eleves.eleve')),
            ],
            options={
                'db_table': 'notification',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='SmsOutbox',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('telephone', models.CharField(max_length=30)),
                ('message', models.TextField()),
                ('type', models.CharField(choices=[('ABSENCE', 'Absence'), ('FRAIS', 'Frais de scolarité'), ('BULLETIN', 'Bulletin'), ('INFO', 'Information')], default='INFO', max_length=12)),
                ('statut', models.CharField(choices=[('PENDING', 'En attente'), ('SIMULATED', 'Simulé (démo)'), ('SENT', 'Envoyé'), ('FAILED', 'Échec')], default='PENDING', max_length=12)),
                ('provider', models.CharField(blank=True, default='stub', max_length=20)),
                ('erreur', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('eleve', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sms', to='eleves.eleve')),
                ('notification', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sms', to='notifications.notification')),
            ],
            options={
                'db_table': 'sms_outbox',
                'ordering': ['-created_at'],
            },
        ),
    ]
