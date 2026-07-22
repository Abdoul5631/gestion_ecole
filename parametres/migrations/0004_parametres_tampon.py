from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0003_parametres_signature'),
    ]

    operations = [
        migrations.AddField(
            model_name='parametres',
            name='tampon',
            field=models.ImageField(blank=True, null=True, upload_to='tampons/'),
        ),
    ]
