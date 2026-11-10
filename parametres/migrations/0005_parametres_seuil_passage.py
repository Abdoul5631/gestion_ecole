from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0004_parametres_tampon'),
    ]

    operations = [
        migrations.AddField(
            model_name='parametres',
            name='seuil_passage',
            field=models.FloatField(
                default=10.0,
                help_text='Moyenne annuelle minimale pour être admis en classe supérieure (hors 3ème / Terminale).',
                verbose_name='Seuil de passage',
            ),
        ),
    ]
