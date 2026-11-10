from django.db import migrations, models
import django.db.models.deletion


def backfill_users(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    User = apps.get_model('accounts', 'User')
    ecole, _ = Parametres.objects.get_or_create(
        pk=1,
        defaults={'nom_ecole': 'Complexe Scolaire Wend-Panga', 'ville': 'Bobo-Dioulasso'},
    )
    User.objects.filter(ecole__isnull=True).update(ecole=ecole)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0005_parametres_seuil_passage'),
        ('accounts', '0004_user_enfants'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='ecole',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='utilisateurs', to='parametres.parametres',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='is_plateforme',
            field=models.BooleanField(
                default=False,
                help_text="Compte plateforme : voit la liste des écoles, pas les données d'une école.",
            ),
        ),
        migrations.RunPython(backfill_users, migrations.RunPython.noop),
    ]
