from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cours', '0005_classematiere_use_classe'),
    ]

    operations = [
        migrations.AddField(
            model_name='enseignant',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
