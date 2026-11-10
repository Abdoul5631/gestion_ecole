from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.contrib.auth.hashers import make_password


def valider_ecoles_existantes_et_superadmin(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    User = apps.get_model('accounts', 'User')
    Parametres.objects.all().update(statut='VALIDEE')

    if not User.objects.filter(username='superadmin').exists():
        User.objects.create(
            username='superadmin',
            email='superadmin@plateforme.local',
            password=make_password('Ecole2025!'),
            role='SUPER_ADMIN',
            is_plateforme=True,
            is_staff=True,
            is_active=True,
            ecole=None,
            first_name='Super',
            last_name='Admin',
        )
    else:
        User.objects.filter(username='superadmin').update(
            role='SUPER_ADMIN',
            is_plateforme=True,
            ecole=None,
            is_staff=True,
            is_active=True,
        )


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('parametres', '0005_parametres_seuil_passage'),
        ('accounts', '0005_user_ecole_plateforme'),
    ]

    operations = [
        migrations.AddField(
            model_name='parametres',
            name='statut',
            field=models.CharField(
                choices=[
                    ('EN_ATTENTE', 'En attente'),
                    ('VALIDEE', 'Validée'),
                    ('REFUSEE', 'Refusée'),
                    ('SUSPENDUE', 'Suspendue'),
                ],
                db_index=True,
                default='EN_ATTENTE',
                max_length=20,
                verbose_name="Statut de l'établissement",
            ),
        ),
        migrations.AddField(
            model_name='parametres',
            name='motif',
            field=models.TextField(blank=True, default='', verbose_name='Motif (refus ou suspension)'),
        ),
        migrations.AddField(
            model_name='parametres',
            name='date_demande',
            field=models.DateTimeField(auto_now_add=True, blank=True, null=True),
        ),
        migrations.AddField(
            model_name='parametres',
            name='date_statut',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='parametres',
            name='validee_par',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='ecoles_traitees',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(valider_ecoles_existantes_et_superadmin, migrations.RunPython.noop),
    ]
